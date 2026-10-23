-- =============================================================================
-- 05 · Regras de negócio da Fase 3 (tarefas, projetos, estudos, revisões, metas)
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

-- "Hoje" no fuso do perfil de teste (UTC), independente do fuso da sessão do banco:
-- as funções calculam datas no fuso do perfil, não com current_date.
create function tests.profile_today()
returns date language sql stable as $$ select (now() at time zone 'UTC')::date $$;

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

select tests.create_user('f0000000-0000-4000-8000-000000000000', 'fabi@example.test',
  '{"display_name": "Fabi", "timezone": "UTC"}');
select tests.authenticate_as('f0000000-0000-4000-8000-000000000000');

-- ===========================================================================
-- Tarefas: dependências, subtarefas, cancelamento, reabertura
-- ===========================================================================
insert into public.tasks (id, title) values
  ('f0000000-0000-4000-8000-000000000001', 'Pré-requisito'),
  ('f0000000-0000-4000-8000-000000000002', 'Dependente'),
  ('f0000000-0000-4000-8000-000000000003', 'Pré-requisito cancelado');
insert into public.task_dependencies (task_id, depends_on_task_id) values
  ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$update public.tasks set status = 'done' where id = 'f0000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'Dependência pendente BLOQUEIA a conclusão');
select lives_ok(
  $$update public.tasks set status = 'in_progress' where id = 'f0000000-0000-4000-8000-000000000002'$$,
  'Iniciar uma tarefa com dependência pendente é permitido (a interface apenas alerta)');
select isnt((select started_at from public.tasks where id = 'f0000000-0000-4000-8000-000000000002'), null,
  'Entrar em andamento registra started_at');
select throws_ok(
  $$insert into public.task_dependencies (task_id, depends_on_task_id)
    values ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002')$$,
  '23514', null, 'Ciclo de dependências é rejeitado');

update public.tasks set status = 'done' where id = 'f0000000-0000-4000-8000-000000000001';
update public.tasks set status = 'cancelled' where id = 'f0000000-0000-4000-8000-000000000003';
select lives_ok(
  $$update public.tasks set status = 'done' where id = 'f0000000-0000-4000-8000-000000000002'$$,
  'Pré-requisitos concluídos ou cancelados liberam a conclusão');
select is((select cancelled_at is not null and completed_at is null from public.tasks
            where id = 'f0000000-0000-4000-8000-000000000003'), true,
  'Cancelada ≠ concluída: cancelled_at preenchido, completed_at vazio');

-- Reabrir
update public.tasks set status = 'todo' where id = 'f0000000-0000-4000-8000-000000000002';
select is((select completed_at is null and started_at is not null from public.tasks
            where id = 'f0000000-0000-4000-8000-000000000002'), true,
  'Reabrir limpa completed_at e preserva started_at (histórico de execução)');
update public.tasks set status = 'todo' where id = 'f0000000-0000-4000-8000-000000000003';
select is((select cancelled_at from public.tasks where id = 'f0000000-0000-4000-8000-000000000003'), null,
  'Reabrir uma cancelada limpa cancelled_at');

-- Subtarefas
insert into public.tasks (id, title) values ('f0000000-0000-4000-8000-000000000010', 'Mãe');
insert into public.tasks (id, title, parent_task_id, status) values
  ('f0000000-0000-4000-8000-000000000011', 'Filha aberta', 'f0000000-0000-4000-8000-000000000010', 'todo'),
  ('f0000000-0000-4000-8000-000000000012', 'Filha em andamento', 'f0000000-0000-4000-8000-000000000010', 'in_progress'),
  ('f0000000-0000-4000-8000-000000000013', 'Filha cancelada', 'f0000000-0000-4000-8000-000000000010', 'cancelled');

select throws_ok(
  $$update public.tasks set status = 'done' where id = 'f0000000-0000-4000-8000-000000000010'$$,
  '23514', null, 'Mãe com subtarefas abertas não pode ser concluída');
select throws_ok(
  $$select public.complete_task('f0000000-0000-4000-8000-000000000010')$$,
  '23514', null, 'complete_task sem incluir subtarefas também respeita a regra');

update public.tasks set status = 'done' where id = 'f0000000-0000-4000-8000-000000000011';
update public.tasks set status = 'done' where id = 'f0000000-0000-4000-8000-000000000012';
select is((select status from public.tasks where id = 'f0000000-0000-4000-8000-000000000010'), 'todo',
  'Concluir todas as subtarefas NÃO conclui a mãe automaticamente');
update public.tasks set status = 'todo' where id = 'f0000000-0000-4000-8000-000000000011';

select is((public.complete_task('f0000000-0000-4000-8000-000000000010', true)).status, 'done',
  'complete_task(id, true) conclui a mãe junto com as subtarefas abertas');
select is((select array_agg(status order by title) from public.tasks
            where parent_task_id = 'f0000000-0000-4000-8000-000000000010'),
  array['done', 'cancelled', 'done'],
  'Subtarefa cancelada continua cancelada; abertas foram concluídas');
select throws_ok($$select public.complete_task('f0000000-0000-4000-8000-0000000000ff')$$, 'P0002', null,
  'complete_task de tarefa inexistente → P0002');

-- Cancelar a mãe cancela as abertas, preserva as concluídas
insert into public.tasks (id, title) values ('f0000000-0000-4000-8000-000000000020', 'Mãe 2');
insert into public.tasks (id, title, parent_task_id, status) values
  ('f0000000-0000-4000-8000-000000000021', 'Aberta', 'f0000000-0000-4000-8000-000000000020', 'todo'),
  ('f0000000-0000-4000-8000-000000000022', 'Feita', 'f0000000-0000-4000-8000-000000000020', 'done');
update public.tasks set status = 'cancelled' where id = 'f0000000-0000-4000-8000-000000000020';
select is((select array_agg(status order by title) from public.tasks
            where parent_task_id = 'f0000000-0000-4000-8000-000000000020'),
  array['cancelled', 'done'], 'Cancelar a mãe cancela só as subtarefas abertas');

select throws_ok(
  $$insert into public.tasks (title, start_on, due_on) values ('Datas', '2026-10-10', '2026-10-01')$$,
  '23514', null, 'Prazo antes do início é rejeitado');

-- ===========================================================================
-- Projetos: histórico de status, marcos, exclusão sem cascata em tarefas
-- ===========================================================================
insert into public.projects (id, name) values ('f0000000-0000-4000-8000-000000000030', 'Projeto');
update public.projects set status = 'on_hold' where id = 'f0000000-0000-4000-8000-000000000030';
update public.projects set name = 'Projeto renomeado' where id = 'f0000000-0000-4000-8000-000000000030';
select is(
  (select array_agg(coalesce(from_status, '∅') || '→' || to_status order by changed_at, from_status nulls first)
     from public.project_status_history where project_id = 'f0000000-0000-4000-8000-000000000030'),
  array['∅→active', 'active→on_hold'], 'Histórico registra criação e mudança de status (não renomeação)');
select is(tests.affected_rows($$update public.project_status_history set to_status = 'done'$$), -1::bigint,
  'Histórico de status não pode ser reescrito pelo navegador');

insert into public.project_milestones (project_id, title) values ('f0000000-0000-4000-8000-000000000030', 'Marco');
insert into public.tasks (id, title, project_id)
  values ('f0000000-0000-4000-8000-000000000031', 'Tarefa do projeto', 'f0000000-0000-4000-8000-000000000030');
delete from public.projects where id = 'f0000000-0000-4000-8000-000000000030';
select is((select project_id from public.tasks where id = 'f0000000-0000-4000-8000-000000000031'), null,
  'Excluir projeto mantém as tarefas (ficam sem projeto)');
select is(tests.row_count('public.project_milestones'), 0::bigint, 'Marcos são do projeto: saem com ele');

-- ===========================================================================
-- Tópicos e subtópicos
-- ===========================================================================
insert into public.subjects (id, name) values
  ('f0000000-0000-4000-8000-000000000040', 'Cálculo'),
  ('f0000000-0000-4000-8000-000000000041', 'Física');
insert into public.topics (id, subject_id, name) values
  ('f0000000-0000-4000-8000-000000000042', 'f0000000-0000-4000-8000-000000000040', 'Integrais');
insert into public.topics (id, subject_id, name, parent_topic_id) values
  ('f0000000-0000-4000-8000-000000000043', 'f0000000-0000-4000-8000-000000000041', 'Por partes',
   'f0000000-0000-4000-8000-000000000042');
select is((select subject_id from public.topics where id = 'f0000000-0000-4000-8000-000000000043'),
  'f0000000-0000-4000-8000-000000000040'::uuid, 'Subtópico herda a matéria do tópico-pai');
select throws_ok(
  $$insert into public.topics (subject_id, name, parent_topic_id)
    values ('f0000000-0000-4000-8000-000000000040', 'Neto', 'f0000000-0000-4000-8000-000000000043')$$,
  '23514', null, 'Apenas um nível de subtópicos');
update public.topics set subject_id = 'f0000000-0000-4000-8000-000000000041'
 where id = 'f0000000-0000-4000-8000-000000000042';
select is((select subject_id from public.topics where id = 'f0000000-0000-4000-8000-000000000043'),
  'f0000000-0000-4000-8000-000000000041'::uuid, 'Mover o tópico de matéria leva os subtópicos');
update public.topics set subject_id = 'f0000000-0000-4000-8000-000000000040'
 where id = 'f0000000-0000-4000-8000-000000000042';

-- ===========================================================================
-- Sessões: registro manual, validação, correção, reflexão
-- ===========================================================================
insert into public.focus_sessions (id, subject_id, topic_id, status, started_at, ended_at, technique) values
  ('f0000000-0000-4000-8000-000000000050', 'f0000000-0000-4000-8000-000000000040',
   'f0000000-0000-4000-8000-000000000042', 'completed', '2026-09-15 10:00Z', '2026-09-15 11:00Z', 'exercises'),
  ('f0000000-0000-4000-8000-000000000051', 'f0000000-0000-4000-8000-000000000040',
   null, 'completed', '2026-09-15 14:00Z', '2026-09-15 14:30Z', 'pomodoro');
select is(
  (select array[kind, source, duration_seconds::text] from public.activities
    where session_id = 'f0000000-0000-4000-8000-000000000050'),
  array['study', 'timer', '3600'], 'Sessão registrada manualmente gera atividade de estudo com a duração');

select throws_ok(
  $$insert into public.focus_sessions (status, started_at, ended_at)
    values ('completed', now() - interval '10 minutes', now() + interval '1 hour')$$,
  '23514', null, 'Sessão terminando no futuro é rejeitada');
select throws_ok(
  $$insert into public.focus_sessions (status, started_at, ended_at)
    values ('completed', '2026-09-01 08:00Z', '2026-09-02 09:00Z')$$,
  '23514', null, 'Sessão acima de 24 h é rejeitada');
select throws_ok(
  $$insert into public.focus_sessions (status, started_at, ended_at)
    values ('completed', '2026-09-01 08:00Z', '2026-09-01 07:00Z')$$,
  '23514', null, 'Fim antes do início é rejeitado (nada de duração negativa)');

-- Correção: trocar o tópico de uma sessão atualiza a atividade
update public.focus_sessions set topic_id = 'f0000000-0000-4000-8000-000000000043'
 where id = 'f0000000-0000-4000-8000-000000000051';
select is((select topic_id from public.activities where session_id = 'f0000000-0000-4000-8000-000000000051'),
  'f0000000-0000-4000-8000-000000000043'::uuid, 'Corrigir o tópico da sessão corrige a atividade');
update public.focus_sessions set topic_id = null where id = 'f0000000-0000-4000-8000-000000000051';

-- Sessão que cruza a meia-noite: duração inteira na atividade
insert into public.focus_sessions (id, status, started_at, ended_at) values
  ('f0000000-0000-4000-8000-000000000052', 'completed', '2026-09-13 23:30Z', '2026-09-14 00:45Z');
select is((select duration_seconds from public.activities where session_id = 'f0000000-0000-4000-8000-000000000052'),
  4500, 'Sessão que cruza a meia-noite mantém a duração completa (75 min)');

-- Reflexão
select throws_ok(
  $$select public.save_session_reflection('f0000000-0000-4000-8000-000000000050', p_questions_count => 5, p_correct_count => 6)$$,
  '23514', null, 'Acertos não podem passar do número de questões');

select lives_ok(
  $$select public.save_session_reflection('f0000000-0000-4000-8000-000000000050',
      p_studied => 'Integração por partes', p_questions_count => 10, p_correct_count => 8,
      p_perceived_difficulty => 3, p_suggested_review_on => '2026-11-05')$$,
  'Reflexão de sessão encerrada é salva');
select is(
  (select array[level::text, source] from public.topic_mastery_events
    where session_id = 'f0000000-0000-4000-8000-000000000050'),
  array['3', 'session'], '80 % de acertos → domínio 3, origem "sessão"');
select is((select due_on from public.review_cards where topic_id = 'f0000000-0000-4000-8000-000000000042'),
  '2026-11-05'::date, 'Data sugerida agenda a revisão do tópico');
select is((select reason from public.review_schedule_log l join public.review_cards c on c.id = l.review_card_id
            where c.topic_id = 'f0000000-0000-4000-8000-000000000042'), 'session',
  'Agendamento pela reflexão é registrado com motivo "session"');

select public.save_session_reflection('f0000000-0000-4000-8000-000000000050',
  p_questions_count => 10, p_correct_count => 10);
select is(
  (select array_agg(level) from public.topic_mastery_events where session_id = 'f0000000-0000-4000-8000-000000000050'),
  array[4::smallint], 'Corrigir a reflexão substitui o registro derivado (sem duplicar)');
select is((select count(*) from public.session_reflections), 1::bigint, 'Uma reflexão por sessão');
select public.save_session_reflection('f0000000-0000-4000-8000-000000000051', p_questions_count => 5, p_correct_count => 5);

insert into public.focus_sessions (id, started_at) values ('f0000000-0000-4000-8000-000000000053', now() - interval '10 minutes');
select throws_ok(
  $$select public.save_session_reflection('f0000000-0000-4000-8000-000000000053')$$,
  '23514', null, 'Sessão em andamento não recebe reflexão');
select throws_ok(
  $$insert into public.focus_sessions (started_at) values (now())$$,
  '23505', null, 'Não há duas sessões ativas ao mesmo tempo');
select public.discard_focus_session('f0000000-0000-4000-8000-000000000053');

insert into public.topic_mastery_events (topic_id, level) values ('f0000000-0000-4000-8000-000000000043', 2);
select is((select source from public.topic_mastery_events where topic_id = 'f0000000-0000-4000-8000-000000000043'),
  'manual', 'Ajuste manual de domínio é registrado como "manual"');
select throws_ok(
  $$insert into public.topic_mastery_events (topic_id, level, source) values ('f0000000-0000-4000-8000-000000000043', 2, 'session')$$,
  '23514', null, 'Origem "sessão" exige a sessão de origem');

-- ===========================================================================
-- Revisões: escada de intervalos, idempotência, adiar, reagendar
-- ===========================================================================
select results_eq(
  $$select r.repetitions, r.interval_days from (values (0, 1), (0, 2), (0, 3), (0, 4), (2, 2), (3, 3), (6, 4), (9, 3))
      v(reps, grade), lateral private.review_next_interval(v.reps, v.grade) r$$,
  $$values (0, 1), (0, 1), (1, 3), (2, 7), (2, 7), (4, 30), (8, 240), (10, 240)$$,
  'Escada [1,3,7,14,30,60,120,240]: errei zera; difícil mantém; bom +1; fácil +2; teto 240');

insert into public.review_cards (id, topic_id, due_on)
  values ('f0000000-0000-4000-8000-000000000060', 'f0000000-0000-4000-8000-000000000043', tests.profile_today());
select is((public.complete_review('f0000000-0000-4000-8000-000000000060', 3)).due_on, tests.profile_today() + 3,
  'Nota 3 numa revisão nova → próxima em 3 dias');
select is((public.complete_review('f0000000-0000-4000-8000-000000000060', 3)).due_on, tests.profile_today() + 3,
  'Segundo envio em < 60 s é ignorado (idempotente)');
select is((select count(*) from public.review_attempts where review_card_id = 'f0000000-0000-4000-8000-000000000060'),
  1::bigint, 'Só uma tentativa registrada');
select is((select count(*) from public.topic_mastery_events where source = 'review'), 1::bigint,
  'A tentativa gera um registro de domínio de origem "revisão"');
select throws_ok($$select public.complete_review('f0000000-0000-4000-8000-000000000060', 5)$$, '22023', null,
  'Nota fora de 1..4 é rejeitada');

select tests.clear_authentication();
update public.review_attempts set reviewed_at = now() - interval '2 minutes';
select tests.authenticate_as('f0000000-0000-4000-8000-000000000000');
select is((select array[repetitions, interval_days] from public.complete_review('f0000000-0000-4000-8000-000000000060', 1)),
  array[0, 1], 'Errei: repetições zeram e a revisão volta amanhã');

select is((public.postpone_review('f0000000-0000-4000-8000-000000000060', 2)).due_on, tests.profile_today() + 3,
  'Adiar 2 dias a partir da data prevista');
select throws_ok($$select public.postpone_review('f0000000-0000-4000-8000-000000000060', 0)$$, '22023', null,
  'Adiar exige de 1 a 60 dias');
select throws_ok($$select public.reschedule_review('f0000000-0000-4000-8000-000000000060', tests.profile_today() - 1)$$,
  '22023', null, 'Reagendar para o passado é rejeitado');
select is((public.reschedule_review('f0000000-0000-4000-8000-000000000060', tests.profile_today() + 10)).due_on,
  tests.profile_today() + 10, 'Reagendar define a nova data');
select is(
  (select array_agg(reason order by reason) from public.review_schedule_log
    where review_card_id = 'f0000000-0000-4000-8000-000000000060'),
  array['completed', 'completed', 'created', 'postponed', 'rescheduled'],
  'Cada mudança de data fica no histórico com o motivo (nada é sobrescrito)');
select is((select count(*) from public.review_attempts where review_card_id = 'f0000000-0000-4000-8000-000000000060'),
  2::bigint, 'Reagendar não apaga as tentativas');

-- ===========================================================================
-- Metas: ciclos, todos os tipos, histórico, alterações
-- ===========================================================================
select results_eq(
  $$select * from private.goal_cycle('weekly', '2026-01-01', null, '2026-09-16', 1)$$,
  $$values ('2026-09-14'::date, '2026-09-21'::date)$$, 'Semana começando na segunda');
select results_eq(
  $$select * from private.goal_cycle('weekly', '2026-01-01', null, '2026-09-16', 0)$$,
  $$values ('2026-09-13'::date, '2026-09-20'::date)$$, 'Semana começando no domingo');
select results_eq(
  $$select * from private.goal_cycle('weekly', '2026-09-15', null, '2026-09-16', 1)$$,
  $$values ('2026-09-15'::date, '2026-09-21'::date)$$, 'Primeiro ciclo não começa antes do início da meta');
select results_eq(
  $$select * from private.goal_cycle('monthly', '2026-01-01', null, '2026-02-10', 1)$$,
  $$values ('2026-02-01'::date, '2026-03-01'::date)$$, 'Ciclo mensal (fevereiro)');
select results_eq(
  $$select * from private.goal_cycle('daily', '2026-01-01', null, '2026-09-16', 1)$$,
  $$values ('2026-09-16'::date, '2026-09-17'::date)$$, 'Ciclo diário');
select results_eq(
  $$select * from private.goal_cycle('once', '2026-09-01', '2026-12-31', '2026-09-16', 1)$$,
  $$values ('2026-09-01'::date, '2027-01-01'::date)$$, 'Meta de longo prazo: do início ao prazo (inclusive)');

-- Dados (semana de 14 a 20/09/2026; "agora" = quarta 16/09 12:00 UTC)
insert into public.activities (title, kind, subject_id, started_at, ended_at) values
  ('Estudo', 'study', 'f0000000-0000-4000-8000-000000000040', '2026-09-14 10:00Z', '2026-09-14 11:30Z');
insert into public.activities (title, kind, started_at, ended_at, distance_km) values
  ('Corrida', 'exercise', '2026-09-15 07:00Z', '2026-09-15 08:00Z', 8);
insert into public.activities (title, kind, started_at, ended_at, pages, reading_title) values
  ('Leitura', 'reading', '2026-09-15 21:00Z', '2026-09-15 22:00Z', 30, 'Livro'),
  ('Leitura antiga', 'reading', '2026-09-10 21:00Z', '2026-09-10 22:00Z', 20, 'Livro');
insert into public.tasks (title, status, completed_at) values
  ('Feita nesta semana', 'done', '2026-09-15 10:00Z'),
  ('Feita na anterior', 'done', '2026-09-08 10:00Z');
insert into public.habits (id, name, target_value, unit, start_on)
  values ('f0000000-0000-4000-8000-000000000070', 'Ler', 20, 'páginas', '2026-09-01');
insert into public.habit_checkins (habit_id, local_date, value) values
  ('f0000000-0000-4000-8000-000000000070', '2026-09-14', 25),
  ('f0000000-0000-4000-8000-000000000070', '2026-09-15', 10),
  ('f0000000-0000-4000-8000-000000000070', '2026-09-16', 20);

insert into public.goals (id, title, target_value, unit, progress_mode, period, start_on, subject_id, activity_kind, habit_id) values
  ('f0000000-0000-4000-8000-000000000080', 'Horas de Cálculo', 10, 'x', 'activity_time', 'weekly', '2026-09-01', 'f0000000-0000-4000-8000-000000000040', null, null),
  ('f0000000-0000-4000-8000-000000000081', 'Exercício', 3, 'x', 'activity_time', 'weekly', '2026-09-01', null, 'exercise', null),
  ('f0000000-0000-4000-8000-000000000082', 'Sessões', 5, 'x', 'study_sessions', 'weekly', '2026-09-01', null, null, null),
  ('f0000000-0000-4000-8000-000000000083', 'Questões', 50, 'x', 'questions', 'weekly', '2026-09-01', null, null, null),
  ('f0000000-0000-4000-8000-000000000084', 'Páginas', 100, 'livros', 'pages', 'weekly', '2026-09-01', null, null, null),
  ('f0000000-0000-4000-8000-000000000085', 'Páginas no mês', 200, 'x', 'pages', 'monthly', '2026-09-01', null, null, null),
  ('f0000000-0000-4000-8000-000000000086', 'Tarefas', 5, 'x', 'tasks_completed', 'weekly', '2026-09-01', null, null, null),
  ('f0000000-0000-4000-8000-000000000087', 'Hábito', 5, 'x', 'habit_checkins', 'weekly', '2026-09-01', null, null, 'f0000000-0000-4000-8000-000000000070'),
  ('f0000000-0000-4000-8000-000000000088', 'Manual', 10, 'livros', 'manual', 'once', '2026-09-01', null, null, null),
  ('f0000000-0000-4000-8000-000000000089', 'Hábito hoje', 1, 'x', 'habit_checkins', 'daily', '2026-09-01', null, null, 'f0000000-0000-4000-8000-000000000070');
insert into public.goal_progress_entries (goal_id, amount, recorded_on) values
  ('f0000000-0000-4000-8000-000000000088', 3, '2026-09-02'),
  ('f0000000-0000-4000-8000-000000000088', 2, '2026-09-15'),
  ('f0000000-0000-4000-8000-000000000088', -1, '2026-09-16'),
  ('f0000000-0000-4000-8000-000000000088', 7, '2026-09-20');

select is((select unit from public.goals where id = 'f0000000-0000-4000-8000-000000000084'), 'páginas',
  'Metas derivadas usam a unidade canônica (o usuário não escolhe "livros" para páginas)');
select is((select unit from public.goals where id = 'f0000000-0000-4000-8000-000000000088'), 'livros',
  'Metas manuais mantêm a unidade escolhida');
select throws_ok(
  $$insert into public.goals (title, target_value, unit, progress_mode, activity_kind) values ('X', 1, 'x', 'manual', 'study')$$,
  '23514', null, 'Meta manual não aceita fonte de dados');

select results_eq(
  $$select goal_id, current_value from public.goal_progress('2026-09-16 12:00Z') order by goal_id$$,
  $$values
    ('f0000000-0000-4000-8000-000000000080'::uuid, 3.00::numeric),
    ('f0000000-0000-4000-8000-000000000081'::uuid, 1.00::numeric),
    ('f0000000-0000-4000-8000-000000000082'::uuid, 2::numeric),
    ('f0000000-0000-4000-8000-000000000083'::uuid, 15::numeric),
    ('f0000000-0000-4000-8000-000000000084'::uuid, 30::numeric),
    ('f0000000-0000-4000-8000-000000000085'::uuid, 50::numeric),
    ('f0000000-0000-4000-8000-000000000086'::uuid, 1::numeric),
    ('f0000000-0000-4000-8000-000000000087'::uuid, 2::numeric),
    ('f0000000-0000-4000-8000-000000000088'::uuid, 4::numeric),
    ('f0000000-0000-4000-8000-000000000089'::uuid, 1::numeric)$$,
  'Progresso de cada tipo no ciclo atual (detalhes no comentário do teste)');
-- 080: 1,5 h (estudo 14/09) + 1 h (sessão 15/09) + 0,5 h (sessão 15/09) = 3 h; a sessão
--      sem matéria que cruza a meia-noite de 13→14/09 não conta (outra matéria/nenhuma).
-- 081: só exercício (1 h). 082: 2 sessões concluídas na semana (a de 13/09 começou antes).
-- 083: 10 + 5 questões. 084: 30 páginas na semana; 085: 50 no mês.
-- 086: 1 tarefa concluída na semana. 087: 14/09 (25 ≥ 20) e 16/09 (20 ≥ 20); 15/09 (10) não atinge.
-- 088: 3 + 2 − 1 = 4; o lançamento de 20/09 é futuro em relação a "agora" e não conta.
-- 089: hábito cumprido hoje (16/09).

select results_eq(
  $$select cycle_start, cycle_end, value from public.goal_history('f0000000-0000-4000-8000-000000000084', 8, '2026-09-16 12:00Z')$$,
  $$values ('2026-09-14'::date, '2026-09-21'::date, 30::numeric),
           ('2026-09-07'::date, '2026-09-14'::date, 20::numeric),
           ('2026-09-01'::date, '2026-09-07'::date, 0::numeric)$$,
  'Histórico semanal até o início da meta (o primeiro ciclo começa no início)');
select is(
  (select count(*) from public.goal_history('f0000000-0000-4000-8000-000000000088', 8, '2026-09-16 12:00Z')),
  3::bigint, 'Meta de longo prazo tem histórico em semanas');

-- Alterações e arquivamento
update public.goals set title = 'Novo título' where id = 'f0000000-0000-4000-8000-000000000084';
select is((select count(*) from public.goal_changes), 0::bigint, 'Renomear não é alteração de configuração');
update public.goals set target_value = 120 where id = 'f0000000-0000-4000-8000-000000000084';
select is((select array[old_target, new_target] from public.goal_changes), array[100, 120]::numeric[],
  'Mudança de alvo fica registrada');
select results_eq(
  $$select value from public.goal_history('f0000000-0000-4000-8000-000000000084', 1, '2026-09-16 12:00Z')$$,
  $$values (30::numeric)$$, 'Editar a meta não reescreve o histórico (valores vêm dos registros)');
select is(tests.affected_rows($$update public.goal_changes set new_target = 1$$), -1::bigint,
  'Histórico de alterações é somente inclusão');
update public.goals set archived_at = now() where id = 'f0000000-0000-4000-8000-000000000084';
select is((select count(*) from public.goal_progress('2026-09-16 12:00Z') where goal_id = 'f0000000-0000-4000-8000-000000000084'),
  0::bigint, 'Meta arquivada sai do progresso atual');
select is((select count(*) from public.goal_history('f0000000-0000-4000-8000-000000000084', 8, '2026-09-16 12:00Z')),
  3::bigint, 'Meta arquivada mantém o histórico consultável');

-- Corrigir um registro muda a estatística
update public.habit_checkins set value = 20 where local_date = '2026-09-15';
select is((select current_value from public.goal_progress('2026-09-16 12:00Z')
            where goal_id = 'f0000000-0000-4000-8000-000000000087'), 3::numeric,
  'Corrigir uma marcação de hábito atualiza o progresso');
delete from public.activities where title = 'Corrida';
select is((select current_value from public.goal_progress('2026-09-16 12:00Z')
            where goal_id = 'f0000000-0000-4000-8000-000000000081'), 0::numeric,
  'Excluir uma atividade atualiza o progresso');

-- Atividades: métricas específicas por tipo
select throws_ok(
  $$insert into public.activities (title, kind, started_at, ended_at, pages) values ('X', 'exercise', '2026-09-01 10:00Z', '2026-09-01 11:00Z', 3)$$,
  '23514', null, 'Páginas só existem em atividades de leitura');
select throws_ok(
  $$insert into public.activities (title, kind, subject_id, started_at, ended_at) values ('X', 'leisure', 'f0000000-0000-4000-8000-000000000040', '2026-09-01 10:00Z', '2026-09-01 11:00Z')$$,
  '23514', null, 'Matéria só existe em atividades de estudo');

-- ===========================================================================
-- Cronômetro: técnica, sessão interrompida, correção de horários com pausas
-- ===========================================================================
select is((public.start_focus_session(p_technique => 'pomodoro', p_planned_seconds => 1500)).technique, 'pomodoro',
  'Início registra a técnica e a meta de duração');
select tests.clear_authentication();
update public.focus_sessions set started_at = now() - interval '3 hours' where status = 'active';
insert into public.session_pauses (user_id, session_id, started_at, ended_at)
select user_id, id, now() - interval '2 hours', now() - interval '110 minutes' from public.focus_sessions where status = 'active';
insert into public.session_pauses (user_id, session_id, started_at)
select user_id, id, now() - interval '1 hour' from public.focus_sessions where status = 'active';
select tests.authenticate_as('f0000000-0000-4000-8000-000000000000');
select throws_ok(
  $$select public.complete_focus_session_at((select id from public.focus_sessions where status = 'active'), now() + interval '1 hour')$$,
  '22023', null, 'Sessão interrompida não pode terminar no futuro');
select is(
  (public.complete_focus_session_at((select id from public.focus_sessions where status = 'active'), now() - interval '90 minutes')).duration_seconds,
  4800, 'Encerrar no instante escolhido: 90 min − 10 min de pausa; pausa posterior descartada');
select is((select count(*) from public.session_pauses p join public.focus_sessions s on s.id = p.session_id
            where s.technique = 'pomodoro'), 1::bigint, 'Só a pausa anterior ao fim permanece');

insert into public.focus_sessions (id, status, started_at, ended_at) values
  ('f0000000-0000-4000-8000-000000000054', 'completed', '2026-09-20 10:00Z', '2026-09-20 11:00Z');
insert into public.session_pauses (session_id, started_at, ended_at)
  values ('f0000000-0000-4000-8000-000000000054', '2026-09-20 10:10Z', '2026-09-20 10:20Z');
update public.focus_sessions set ended_at = '2026-09-20 11:00Z' where id = 'f0000000-0000-4000-8000-000000000054';
select is((select duration_seconds from public.activities where session_id = 'f0000000-0000-4000-8000-000000000054'),
  3000, 'Pausa descontada do tempo líquido');
select throws_ok(
  $$update public.focus_sessions set ended_at = '2026-09-20 10:05Z' where id = 'f0000000-0000-4000-8000-000000000054'$$,
  '23514', null, 'Edição direta não pode deixar uma pausa fora da sessão');
select is((public.correct_focus_session('f0000000-0000-4000-8000-000000000054', '2026-09-20 10:15Z', '2026-09-20 10:45Z')).duration_seconds,
  1500, 'Correção ajusta a pausa à nova janela: 30 min − 5 min de pausa');
select is((public.correct_focus_session('f0000000-0000-4000-8000-000000000054', '2026-09-20 10:00Z', '2026-09-20 10:05Z')).duration_seconds,
  300, 'Pausa que fica totalmente fora da janela é removida (tempo nunca negativo)');
select throws_ok(
  $$select public.correct_focus_session('f0000000-0000-4000-8000-000000000054', '2026-09-20 10:05Z', '2026-09-20 10:00Z')$$,
  '22023', null, 'Correção com fim antes do início é rejeitada');

-- Tempo de estudo por matéria: interseção com a janela, só atividades de estudo
select results_eq(
  $$select subject_id, seconds from public.study_time_by_subject('2026-09-14 00:00Z', '2026-09-21 00:00Z')
     where subject_id is not null order by subject_id$$,
  $$values ('f0000000-0000-4000-8000-000000000040'::uuid, 10800)$$,
  'Cálculo na semana: 1,5 h + 1 h + 0,5 h (sessões e lançamento manual)');
select is(
  (select seconds from public.study_time_by_subject('2026-09-14 00:00Z', '2026-09-21 00:00Z') where subject_id is null),
  3000, 'Sessões sem matéria: 45 min da sessão de 13→14/09 dentro da semana + 5 min da sessão corrigida');

select * from finish();
rollback;
