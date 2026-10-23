-- =============================================================================
-- 03 · Regras de negócio e restrições relacionais
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Auxiliares de teste (existem só dentro desta transação; tudo é desfeito no
-- ROLLBACK final). authenticate_as reproduz o que o PostgREST faz a cada
-- requisição: papel "authenticated" + claims do JWT com o sub do usuário.
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.create_user(p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (p_id, p_email, p_meta) returning id;
$$;

create function tests.authenticate_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.authenticate_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

create function tests.clear_authentication()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Linhas visíveis ao papel atual (o RLS se aplica).
create function tests.row_count(p_table regclass)
returns bigint language plpgsql as $$
declare v bigint;
begin
  execute format('select count(*) from %s', p_table) into v;
  return v;
end;
$$;

-- Linhas afetadas por um UPDATE/DELETE; -1 se o papel nem tem o privilégio.
create function tests.affected_rows(p_sql text)
returns bigint language plpgsql as $$
declare v bigint;
begin
  execute format('with x as (%s returning 1) select count(*) from x', p_sql) into v;
  return v;
exception when insufficient_privilege then
  return -1;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Cadastro → perfil
-- ---------------------------------------------------------------------------
select tests.create_user('cccccccc-0000-4000-8000-000000000001', 'carla@example.test',
  '{"display_name": "  Carla  ", "timezone": "America/Sao_Paulo"}');
select tests.create_user('cccccccc-0000-4000-8000-000000000002', 'dani@example.test',
  '{"display_name": "Dani", "timezone": "Mars/Olympus_Mons"}');

select results_eq(
  $$ select display_name, timezone from public.profiles where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  $$ values ('Carla'::text, 'America/Sao_Paulo'::text) $$,
  'Cadastro cria perfil com nome aparado e fuso informado');
select is(
  (select timezone from public.profiles where id = 'cccccccc-0000-4000-8000-000000000002'), 'UTC',
  'Fuso inválido no cadastro cai para UTC');

select tests.authenticate_as('cccccccc-0000-4000-8000-000000000001');

select throws_ok(
  $$ update public.profiles set timezone = 'Hora/Inventada' $$, '23514', null,
  'Perfil rejeita fuso IANA inválido');
select lives_ok(
  $$ update public.profiles set timezone = 'Europe/Lisbon', week_starts_on = 0, theme_preference = 'dark' $$,
  'Perfil aceita fuso, início da semana e tema válidos');
select throws_ok($$ update public.profiles set theme_preference = 'neon' $$, '23514', null,
  'Tema precisa ser light, dark ou system');
select throws_ok($$ update public.profiles set created_at = now() - interval '1 year' $$, '42501', null,
  'created_at do perfil não é editável');
update public.profiles set timezone = 'America/Sao_Paulo';

-- ---------------------------------------------------------------------------
-- Tarefas: conclusão, subtarefas e dependências
-- ---------------------------------------------------------------------------
insert into public.projects (id, name) values
  ('c0000000-0000-4000-8000-000000000001', 'TCC'),
  ('c0000000-0000-4000-8000-000000000002', 'Pessoal');
insert into public.tasks (id, title, project_id) values
  ('c0000000-0000-4000-8000-000000000010', 'Capítulo 2', 'c0000000-0000-4000-8000-000000000001');
insert into public.tasks (id, title, parent_task_id, project_id) values
  ('c0000000-0000-4000-8000-000000000011', 'Revisar referências', 'c0000000-0000-4000-8000-000000000010',
   'c0000000-0000-4000-8000-000000000002');

select is((select project_id from public.tasks where id = 'c0000000-0000-4000-8000-000000000011'),
  'c0000000-0000-4000-8000-000000000001'::uuid,
  'Subtarefa herda o projeto da tarefa-mãe (ignora projeto divergente)');

update public.tasks set project_id = 'c0000000-0000-4000-8000-000000000002'
 where id = 'c0000000-0000-4000-8000-000000000010';
select is((select project_id from public.tasks where id = 'c0000000-0000-4000-8000-000000000011'),
  'c0000000-0000-4000-8000-000000000002'::uuid,
  'Mover a tarefa-mãe de projeto move as subtarefas');

select throws_ok(
  $$ insert into public.tasks (title, parent_task_id) values ('Neta', 'c0000000-0000-4000-8000-000000000011') $$,
  '23514', 'Subtarefas não podem ter subtarefas', 'Subtarefas têm um único nível');

insert into public.tasks (id, title) values ('c0000000-0000-4000-8000-000000000012', 'Avulsa');
select throws_ok(
  $$ update public.tasks set parent_task_id = 'c0000000-0000-4000-8000-000000000012'
      where id = 'c0000000-0000-4000-8000-000000000010' $$,
  '23514', 'Uma tarefa com subtarefas não pode virar subtarefa', 'Tarefa com filhas não vira subtarefa');
select throws_ok(
  $$ update public.tasks set parent_task_id = id where id = 'c0000000-0000-4000-8000-000000000012' $$,
  '23514', null, 'Tarefa não é mãe de si mesma');

update public.tasks set status = 'done' where id = 'c0000000-0000-4000-8000-000000000012';
select isnt((select completed_at from public.tasks where id = 'c0000000-0000-4000-8000-000000000012'), null,
  'Concluir a tarefa registra completed_at no servidor');
update public.tasks set status = 'todo' where id = 'c0000000-0000-4000-8000-000000000012';
select is((select completed_at from public.tasks where id = 'c0000000-0000-4000-8000-000000000012'), null,
  'Reabrir a tarefa limpa completed_at');
select throws_ok($$ insert into public.tasks (title, estimate_minutes) values ('x', 0) $$, '23514', null,
  'Estimativa precisa ser positiva');
select throws_ok($$ insert into public.tasks (title) values ('   ') $$, '23514', null,
  'Título em branco é rejeitado');

insert into public.task_dependencies (task_id, depends_on_task_id)
  values ('c0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000010');
select throws_ok(
  $$ insert into public.task_dependencies (task_id, depends_on_task_id)
     values ('c0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000012') $$,
  '23514', 'Dependência circular entre tarefas', 'Dependência direta em ciclo é rejeitada');
select lives_ok(
  $$ insert into public.task_dependencies (task_id, depends_on_task_id)
     values ('c0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000012') $$,
  'Cadeia sem ciclo é aceita (11 → 12 → 10)');
select throws_ok(
  $$ insert into public.task_dependencies (task_id, depends_on_task_id)
     values ('c0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000011') $$,
  '23514', 'Dependência circular entre tarefas', 'Ciclo indireto (10 → 11 → 12 → 10) é rejeitado');
select throws_ok(
  $$ insert into public.task_dependencies (task_id, depends_on_task_id)
     values ('c0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000010') $$,
  '23514', null, 'Tarefa não depende de si mesma');

delete from public.projects where id = 'c0000000-0000-4000-8000-000000000002';
select is((select count(*) from public.tasks where project_id is null and id in (
  'c0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000011')), 2::bigint,
  'Excluir projeto preserva as tarefas (project_id vira nulo)');

-- ---------------------------------------------------------------------------
-- Sessões de foco e pausas (RN-04, RN-05, RN-06)
-- ---------------------------------------------------------------------------
insert into public.subjects (id, name) values ('c0000000-0000-4000-8000-000000000020', 'Estruturas de Dados');
insert into public.topics (id, subject_id, name)
  values ('c0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000020', 'Árvores AVL');
insert into public.subjects (id, name) values ('c0000000-0000-4000-8000-000000000022', 'Outra matéria');

select throws_ok($$ insert into public.subjects (name) values ('estruturas de dados') $$, '23505', null,
  'Nome de matéria ativa é único por usuário (sem diferenciar maiúsculas)');

-- Sessão com instantes explícitos: 10:00–11:00 com pausa de 15 min.
insert into public.focus_sessions (id, topic_id, subject_id, started_at)
  values ('c0000000-0000-4000-8000-000000000030', 'c0000000-0000-4000-8000-000000000021',
          'c0000000-0000-4000-8000-000000000022', '2026-10-20 10:00-03');
select is((select subject_id from public.focus_sessions where id = 'c0000000-0000-4000-8000-000000000030'),
  'c0000000-0000-4000-8000-000000000020'::uuid,
  'Matéria da sessão é derivada do tópico (combinação incoerente é corrigida)');

select throws_ok(
  $$ insert into public.focus_sessions (started_at) values ('2026-10-20 12:00-03') $$,
  '23505', null, 'RN-06: segunda sessão ativa é rejeitada');

insert into public.session_pauses (session_id, started_at, ended_at)
  values ('c0000000-0000-4000-8000-000000000030', '2026-10-20 10:20-03', '2026-10-20 10:35-03');
select throws_ok(
  $$ insert into public.session_pauses (session_id, started_at, ended_at)
     values ('c0000000-0000-4000-8000-000000000030', '2026-10-20 10:30-03', '2026-10-20 10:40-03') $$,
  '23P01', null, 'Pausas da mesma sessão não se sobrepõem');
select throws_ok(
  $$ insert into public.session_pauses (session_id, started_at, ended_at)
     values ('c0000000-0000-4000-8000-000000000030', '2026-10-20 09:50-03', '2026-10-20 09:55-03') $$,
  '23514', 'A pausa começa antes da sessão', 'Pausa não começa antes da sessão');

insert into public.session_pauses (session_id, started_at)
  values ('c0000000-0000-4000-8000-000000000030', '2026-10-20 10:50-03');
select throws_ok(
  $$ insert into public.session_pauses (session_id, started_at)
     values ('c0000000-0000-4000-8000-000000000030', '2026-10-20 10:55-03') $$,
  null, null, 'RN-05: segunda pausa aberta é rejeitada');
select throws_ok(
  $$ update public.focus_sessions set status = 'completed', ended_at = '2026-10-20 11:00-03'
      where id = 'c0000000-0000-4000-8000-000000000030' $$,
  '23514', null, 'RN-05: não encerra com pausa aberta além do fim');
update public.session_pauses set ended_at = '2026-10-20 10:52-03'
 where session_id = 'c0000000-0000-4000-8000-000000000030' and ended_at is null;

select throws_ok(
  $$ insert into public.activities (session_id, title, started_at, ended_at)
     values ('c0000000-0000-4000-8000-000000000030', 'x', '2026-10-20 10:00-03', '2026-10-20 11:00-03') $$,
  '23514', 'Somente sessões encerradas geram atividades', 'Sessão ativa não gera atividade');

update public.focus_sessions set status = 'completed', ended_at = '2026-10-20 11:00-03'
 where id = 'c0000000-0000-4000-8000-000000000030';

select results_eq(
  $$ select source, duration_seconds, subject_id, topic_id from public.activities
      where session_id = 'c0000000-0000-4000-8000-000000000030' $$,
  $$ values ('timer'::text, 2580, 'c0000000-0000-4000-8000-000000000020'::uuid,
             'c0000000-0000-4000-8000-000000000021'::uuid) $$,
  'RN-03/RN-04: encerrar gera atividade de cronômetro com 43 min líquidos (60 − 15 − 2)');

update public.session_pauses set ended_at = '2026-10-20 10:30-03'
 where session_id = 'c0000000-0000-4000-8000-000000000030' and started_at = '2026-10-20 10:20-03';
select is((select duration_seconds from public.activities where session_id = 'c0000000-0000-4000-8000-000000000030'),
  2880, 'Corrigir uma pausa recalcula a atividade (60 − 10 − 2 = 48 min)');

update public.activities set duration_seconds = 99999, started_at = '2026-10-19 00:00-03'
 where session_id = 'c0000000-0000-4000-8000-000000000030';
select results_eq(
  $$ select duration_seconds, started_at from public.activities
      where session_id = 'c0000000-0000-4000-8000-000000000030' $$,
  $$ values (2880, '2026-10-20 10:00-03'::timestamptz) $$,
  'Duração e instantes de atividade de cronômetro não podem ser forjados pelo cliente');

select throws_ok(
  $$ update public.focus_sessions set status = 'active', ended_at = null
      where id = 'c0000000-0000-4000-8000-000000000030' $$,
  '23514', null, 'Sessão encerrada não volta a ficar ativa');

-- Ciclo de vida pelas funções (relógio do servidor)
select lives_ok($$ select public.start_focus_session(p_subject_id => 'c0000000-0000-4000-8000-000000000020') $$,
  'start_focus_session inicia uma sessão');
-- Dentro de uma transação now() é constante: recua o início para simular tempo decorrido.
update public.focus_sessions set started_at = now() - interval '25 minutes' where status = 'active';
select throws_ok($$ select public.start_focus_session() $$, '23505', 'Já existe uma sessão de foco ativa',
  'start_focus_session respeita RN-06 com mensagem clara');
select lives_ok(
  $$ select public.pause_focus_session((select id from public.focus_sessions where status = 'active')) $$,
  'pause_focus_session pausa');
select throws_ok(
  $$ select public.pause_focus_session((select id from public.focus_sessions where status = 'active')) $$,
  '23505', 'A sessão já está pausada', 'Não pausa duas vezes');
select lives_ok(
  $$ select public.resume_focus_session((select id from public.focus_sessions where status = 'active')) $$,
  'resume_focus_session retoma');
select throws_ok(
  $$ select public.resume_focus_session((select id from public.focus_sessions where status = 'active')) $$,
  '23514', 'A sessão não está pausada', 'Não retoma o que não está pausado');
select lives_ok(
  $$ select public.discard_focus_session((select id from public.focus_sessions where status = 'active')) $$,
  'discard_focus_session descarta');
select is((select count(*) from public.activities a join public.focus_sessions s on s.id = a.session_id
            where s.status = 'discarded'), 0::bigint, 'Sessão descartada não gera tempo realizado');

-- ---------------------------------------------------------------------------
-- Atividades manuais
-- ---------------------------------------------------------------------------
insert into public.activities (id, title, started_at, ended_at, duration_seconds)
  values ('c0000000-0000-4000-8000-000000000040', 'Leitura', '2026-10-20 20:00-03', '2026-10-20 20:45-03', 1);
select results_eq(
  $$ select source, duration_seconds from public.activities where id = 'c0000000-0000-4000-8000-000000000040' $$,
  $$ values ('manual'::text, 2700) $$, 'Atividade manual: duração calculada pelo servidor (45 min)');
select throws_ok(
  $$ insert into public.activities (title, started_at, ended_at) values ('x', '2026-10-20 10:00-03', '2026-10-20 10:00-03') $$,
  '23514', null, 'Atividade precisa terminar depois de começar');
select throws_ok(
  $$ insert into public.activities (title, started_at, ended_at, task_id, project_id)
     values ('x', '2026-10-20 10:00-03', '2026-10-20 11:00-03', 'c0000000-0000-4000-8000-000000000012',
             'c0000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'Com tarefa, o projeto vem da tarefa (não ambos)');

-- ---------------------------------------------------------------------------
-- Hábitos, metas, diário
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.habits (name, schedule_kind) values ('x', 'weekdays') $$, '23514', null,
  'Hábito em dias da semana exige os dias');
select throws_ok($$ insert into public.habits (name, schedule_kind, weekdays) values ('x', 'weekdays', '{1,9}') $$,
  '23514', null, 'Dias da semana entre 0 e 6');
select lives_ok($$ insert into public.habits (id, name, schedule_kind, weekdays, target_value, unit)
                   values ('c0000000-0000-4000-8000-000000000050', 'Ler', 'weekdays', '{1,3,5}', 20, 'páginas') $$,
  'Hábito com dias e meta por marcação');
select is((select start_on from public.habits where id = 'c0000000-0000-4000-8000-000000000050'),
  (now() at time zone 'America/Sao_Paulo')::date, 'Início padrão do hábito é o dia local do perfil');
insert into public.habit_checkins (habit_id, local_date, value)
  values ('c0000000-0000-4000-8000-000000000050', '2026-10-20', 22);
select throws_ok(
  $$ insert into public.habit_checkins (habit_id, local_date) values ('c0000000-0000-4000-8000-000000000050', '2026-10-20') $$,
  '23505', null, 'Uma marcação por hábito por dia');

select throws_ok(
  $$ insert into public.goals (title, target_value, unit, subject_id) values ('x', 10, 'h', 'c0000000-0000-4000-8000-000000000020') $$,
  '23514', null, 'Meta manual não tem fonte automática');
insert into public.goals (id, title, progress_mode, target_value, unit)
  values ('c0000000-0000-4000-8000-000000000052', 'Estudar 20 h', 'activity_time', 20, 'páginas');
select is((select unit from public.goals where id = 'c0000000-0000-4000-8000-000000000052'), 'h',
  'Meta por tempo é sempre medida em horas (unidade canônica definida pelo servidor)');
select throws_ok(
  $$ insert into public.goals (title, progress_mode, target_value, unit, subject_id, project_id)
     values ('x', 'activity_time', 10, 'h', 'c0000000-0000-4000-8000-000000000020', 'c0000000-0000-4000-8000-000000000001') $$,
  '23514', null, 'Meta por tempo tem no máximo uma fonte');
select throws_ok(
  $$ insert into public.goals (title, progress_mode, target_value, unit) values ('x', 'habit_checkins', 10, 'vezes') $$,
  '23514', null, 'Meta por hábito exige o hábito');
select lives_ok(
  $$ with g as (insert into public.goals (title, target_value, unit) values ('Ler 6 livros', 6, 'livros') returning id)
     insert into public.goal_progress_entries (goal_id, amount, recorded_on) select id, 4, '2026-10-10' from g $$,
  'Meta manual recebe lançamentos datados');

insert into public.goals (id, title, progress_mode, target_value, unit, subject_id)
  values ('c0000000-0000-4000-8000-000000000051', 'Estudar ED', 'activity_time', 10, 'h', 'c0000000-0000-4000-8000-000000000022');
select throws_ok(
  $$ delete from public.subjects where id = 'c0000000-0000-4000-8000-000000000022' $$,
  '23503', null, 'Não se exclui a fonte de uma meta (arquive a matéria)');

insert into public.diary_entries (local_date, content, mood, energy) values ('2026-10-20', 'Hoje rendeu.', 4, 3);
select throws_ok($$ insert into public.diary_entries (local_date) values ('2026-10-20') $$, '23505', null,
  'RN-12: uma entrada de diário por dia local');
select throws_ok($$ insert into public.diary_entries (local_date, mood) values ('2026-10-21', 6) $$, '23514', null,
  'Humor entre 1 e 5');

-- ---------------------------------------------------------------------------
-- Calendário
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.calendar_events (title, starts_at, ends_at) values ('Aula', '2026-10-20 19:00-03', '2026-10-20 22:30-03') $$,
  'Evento com horário');
select is((select timezone from public.calendar_events where title = 'Aula'), 'America/Sao_Paulo',
  'Evento guarda o fuso do perfil por padrão');
select lives_ok(
  $$ insert into public.calendar_events (title, all_day, start_date, end_date) values ('Feriado', true, '2026-11-02', '2026-11-03') $$,
  'Evento de dia inteiro usa datas (fim exclusivo)');
select throws_ok(
  $$ insert into public.calendar_events (title, all_day, starts_at, ends_at) values ('x', true, now(), now() + interval '1 hour') $$,
  '23514', null, 'Dia inteiro não usa instantes');
select throws_ok(
  $$ insert into public.calendar_events (title, starts_at, ends_at) values ('x', '2026-10-20 10:00-03', '2026-10-20 09:00-03') $$,
  '23514', null, 'Evento termina depois de começar');
select throws_ok(
  $$ insert into public.calendar_events (title, starts_at, ends_at, recurrence_rule)
     values ('x', '2026-10-20 10:00-03', '2026-10-20 11:00-03', 'todo dia') $$,
  '23514', null, 'Recorrência precisa ser uma RRULE');

-- ---------------------------------------------------------------------------
-- Recomendações: o usuário só decide
-- ---------------------------------------------------------------------------
select tests.clear_authentication();
insert into public.recommendations (id, user_id, rule_id, title, rationale)
  values ('c0000000-0000-4000-8000-000000000060', 'cccccccc-0000-4000-8000-000000000001', 'study.gap', 'Estude ED', 'Sem estudo há 5 dias.');
select tests.authenticate_as('cccccccc-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.recommendations (rule_id, title, rationale) values ('x', 'x', 'x') $$,
  '42501', null, 'Navegador não cria recomendações');
select throws_ok(
  $$ update public.recommendations set rationale = 'outra' $$, '42501', null,
  'Navegador não reescreve a justificativa');
update public.recommendations set status = 'accepted', decision_note = 'Boa ideia'
 where id = 'c0000000-0000-4000-8000-000000000060';
select isnt((select decided_at from public.recommendations where id = 'c0000000-0000-4000-8000-000000000060'), null,
  'Decisão registra decided_at no servidor');
select throws_ok(
  $$ update public.recommendations set status = 'pending' where id = 'c0000000-0000-4000-8000-000000000060' $$,
  '23514', null, 'Decisão não volta a pendente');

select tests.clear_authentication();
select * from finish();
rollback;
