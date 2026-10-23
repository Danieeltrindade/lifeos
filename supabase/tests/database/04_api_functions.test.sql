-- =============================================================================
-- 04 · Funções da API: dashboard_summary (datas e fusos), exportação e exclusão
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

select tests.create_user('dddddddd-0000-4000-8000-000000000001', 'davi@example.test', '{"timezone": "America/Sao_Paulo"}');
select tests.create_user('eeeeeeee-0000-4000-8000-000000000001', 'eva@example.test', '{"timezone": "America/New_York"}');

-- ---------------------------------------------------------------------------
-- Cenário de D (São Paulo). "Agora" = 20/10/2026 15:00 local.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('dddddddd-0000-4000-8000-000000000001');

insert into public.subjects (id, name) values
  ('d0000000-0000-4000-8000-000000000001', 'Cálculo II'),
  ('d0000000-0000-4000-8000-000000000002', 'Banco de Dados');
insert into public.activity_categories (id, name) values ('d0000000-0000-4000-8000-000000000003', 'Saúde');

-- (1) manual atravessando a meia-noite: 19/10 23:00 → 20/10 01:00 (60 min hoje, 60 ontem)
insert into public.activities (title, kind, subject_id, started_at, ended_at)
  values ('Lista de integrais', 'study', 'd0000000-0000-4000-8000-000000000001', '2026-10-19 23:00-03', '2026-10-20 01:00-03');
-- (2) cronômetro atravessando a meia-noite com pausa DEPOIS dela:
--     19/10 23:30 → 20/10 00:30, pausa 00:10–00:20 → ontem 30 min, hoje 20 min
insert into public.focus_sessions (id, subject_id, started_at)
  values ('d0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000002', '2026-10-19 23:30-03');
insert into public.session_pauses (session_id, started_at, ended_at)
  values ('d0000000-0000-4000-8000-000000000010', '2026-10-20 00:10-03', '2026-10-20 00:20-03');
update public.focus_sessions set status = 'completed', ended_at = '2026-10-20 00:30-03'
 where id = 'd0000000-0000-4000-8000-000000000010';
-- (3) manual hoje 08:00–09:00
insert into public.activities (title, kind, subject_id, started_at, ended_at)
  values ('Revisão', 'study', 'd0000000-0000-4000-8000-000000000001', '2026-10-20 08:00-03', '2026-10-20 09:00-03');
-- (4) fora da janela de 7 dias (12/10)
insert into public.activities (title, kind, subject_id, started_at, ended_at)
  values ('Antiga', 'study', 'd0000000-0000-4000-8000-000000000001', '2026-10-12 10:00-03', '2026-10-12 11:00-03');
-- (5) sem matéria (não é estudo)
insert into public.activities (title, kind, category_id, started_at, ended_at)
  values ('Caminhada', 'exercise', 'd0000000-0000-4000-8000-000000000003', '2026-10-20 07:00-03', '2026-10-20 07:30-03');

-- Planejamento (calendário)
insert into public.calendar_events (title, kind, starts_at, ends_at) values
  ('Estudo da tarde', 'study', '2026-10-20 14:00-03', '2026-10-20 15:30-03'),
  ('Estudo noturno', 'study', '2026-10-19 22:00-03', '2026-10-20 00:30-03'),
  ('Reunião amanhã', 'event', '2026-10-21 10:00-03', '2026-10-21 11:00-03');
insert into public.calendar_events (title, kind, starts_at, ends_at, recurrence_rule) values
  ('Recorrente (Fase 4)', 'study', '2026-10-20 18:00-03', '2026-10-20 19:00-03', 'FREQ=DAILY');
insert into public.calendar_events (title, all_day, start_date, end_date) values
  ('Semana de provas', true, '2026-10-19', '2026-10-24');

-- Tarefas
insert into public.tasks (title, priority, due_on, status) values
  ('Baixa sem prazo', 'low', null, 'todo'),
  ('Alta para depois', 'high', '2026-10-25', 'todo'),
  ('Alta para amanhã', 'high', '2026-10-21', 'in_progress'),
  ('Média', 'medium', '2026-10-22', 'todo'),
  ('Média sem prazo', 'medium', null, 'todo'),
  ('Baixa com prazo', 'low', '2026-10-21', 'todo'),
  ('Concluída', 'high', '2026-10-20', 'done'),
  ('Atrasada baixa', 'low', '2026-10-18', 'todo');

-- Projetos
insert into public.projects (id, name, status) values
  ('d0000000-0000-4000-8000-000000000040', 'TCC', 'active'),
  ('d0000000-0000-4000-8000-000000000041', 'Pausado', 'on_hold');
insert into public.tasks (title, project_id, status) values
  ('Cap. 1', 'd0000000-0000-4000-8000-000000000040', 'done'),
  ('Cap. 2', 'd0000000-0000-4000-8000-000000000040', 'todo'),
  ('Cap. 3', 'd0000000-0000-4000-8000-000000000040', 'cancelled');

-- Metas
insert into public.goals (title, progress_mode, target_value, unit, subject_id, start_on)
  values ('Cálculo 60 h', 'activity_time', 60, 'h', 'd0000000-0000-4000-8000-000000000001', '2026-10-01');
insert into public.goals (id, title, target_value, unit, due_on, start_on)
  values ('d0000000-0000-4000-8000-000000000050', 'Ler 6 livros', 6, 'livros', '2026-12-31', '2026-10-01');
insert into public.goal_progress_entries (goal_id, amount, recorded_on)
  values ('d0000000-0000-4000-8000-000000000050', 4, '2026-10-10');

-- Revisões
insert into public.topics (id, subject_id, name) values
  ('d0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000001', 'Integrais por partes'),
  ('d0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000001', 'Séries'),
  ('d0000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000002', 'Normalização');
insert into public.review_cards (topic_id, due_on, status) values
  ('d0000000-0000-4000-8000-000000000020', '2026-10-22', 'active'),
  ('d0000000-0000-4000-8000-000000000021', '2026-11-30', 'active'),
  ('d0000000-0000-4000-8000-000000000022', '2026-10-20', 'suspended');

select tests.clear_authentication();
insert into public.recommendations (user_id, rule_id, title, rationale, status, generated_at, decided_at, expires_at) values
  ('dddddddd-0000-4000-8000-000000000001', 'r.pending', 'Pendente', 'Motivo', 'pending', '2026-10-20 08:00-03', null, null),
  ('dddddddd-0000-4000-8000-000000000001', 'r.accepted', 'Aceita', 'Motivo', 'accepted', '2026-10-20 08:00-03', '2026-10-20 09:00-03', null),
  ('dddddddd-0000-4000-8000-000000000001', 'r.expired', 'Vencida', 'Motivo', 'pending', '2026-10-20 08:00-03', null, '2026-10-20 12:00-03');

select tests.authenticate_as('dddddddd-0000-4000-8000-000000000001');

create temporary table summary on commit drop as
  select public.dashboard_summary('2026-10-20 15:00-03') as s;
grant select on summary to authenticated;

select is((select s ->> 'localDate' from summary), '2026-10-20', 'Dia local calculado no fuso do perfil');
select is((select s ->> 'origin' from summary), 'user', 'Origem marcada como dados do usuário');

select is((select (s -> 'studies' ->> 'actualMinutesToday')::int from summary), 140,
  'Hoje: 60 (parte de 1) + 20 (parte líquida de 2) + 60 (3) = 140 min');
select is((select (s -> 'studies' ->> 'actualMinutesLast7Days')::int from summary), 230,
  'Últimos 7 dias: 120 + 50 + 60 = 230 min (12/10 fica de fora)');
select is((select (s -> 'studies' ->> 'sessionsToday')::int from summary), 3,
  'Três registros de estudo tocam o dia de hoje');
select is(
  (select jsonb_path_query_array(s, '$.studies.topSubjectsLast7Days[*].actualMinutes') from summary),
  '[180, 50]'::jsonb, 'Matérias mais estudadas: Cálculo 180, Banco de Dados 50');

select ok((select not (s ? 'agenda') from summary),
  'Agenda não vem do servidor: a interface expande recorrências com a mesma regra do calendário');

select is(
  (select jsonb_path_query_array(s, '$.priorityTasks[*].title') from summary),
  '["Atrasada baixa", "Alta para amanhã", "Alta para depois", "Média", "Média sem prazo", "Cap. 2"]'::jsonb,
  'Tarefas prioritárias: atrasadas primeiro, depois prioridade e prazo; concluídas fora; no máximo 6');

select is(
  (select s -> 'goals' from summary) @> '[{"title": "Cálculo 60 h", "current": 4.0, "progressMode": "activity_time"}]'::jsonb,
  true, 'Meta por tempo deriva 4,0 h das atividades da matéria desde o início da meta');
select is(
  (select s -> 'goals' from summary) @> '[{"title": "Ler 6 livros", "current": 4, "progressMode": "manual", "period": "once"}]'::jsonb,
  true, 'Meta manual soma seus lançamentos e é marcada como manual (RN-10)');
select is(
  (select s -> 'activeProjects' from summary),
  '[{"id": "d0000000-0000-4000-8000-000000000040", "name": "TCC", "dueOn": null, "priority": "medium", "tasksDone": 1, "tasksTotal": 2}]'::jsonb,
  'Projetos ativos com progresso: 1 de 2 tarefas (cancelada não conta); pausados fora');
select is((select (s -> 'reviewCounts' ->> 'overdue')::int from summary), 0, 'Nenhuma revisão atrasada');
select is((select s -> 'setup' ->> 'subjects' from summary), '2', 'Contadores de início (setup)');

select is(
  (select jsonb_path_query_array(s, '$.reviews[*].topicName') from summary),
  '["Integrais por partes"]'::jsonb, 'Revisões: próximos 7 dias, sem suspensas');
select is(
  (select jsonb_path_query_array(s, '$.recommendations[*].title') from summary),
  '["Pendente"]'::jsonb, 'Recomendações: só pendentes e não vencidas');
select is((select jsonb_array_length(s -> 'recentActivities') from summary), 5, 'Cinco atividades recentes');
select is((select s -> 'recentActivities' -> 0 ->> 'title' from summary), 'Revisão',
  'Atividade mais recente primeiro');
select ok(
  (select s -> 'recentActivities' from summary) @> '[{"title": "Sessão de foco — Banco de Dados", "source": "timer", "kind": "study", "durationMinutes": 50}]'::jsonb,
  'Atividade de cronômetro aparece com origem e duração líquida');

-- O "dia" depende do fuso do perfil.
update public.profiles set timezone = 'UTC';
select is(
  (public.dashboard_summary('2026-10-20 15:00-03') -> 'studies' ->> 'actualMinutesToday')::int, 230,
  'Com fuso UTC, o dia 20/10 vai de 21:00 a 21:00 (-03) e inclui (1) e (2) inteiras');
update public.profiles set timezone = 'America/Sao_Paulo';

-- ---------------------------------------------------------------------------
-- Horário de verão: 01/11/2026 em Nova York tem 25 horas.
-- ---------------------------------------------------------------------------
select tests.authenticate_as('eeeeeeee-0000-4000-8000-000000000001');
insert into public.subjects (id, name) values ('e0000000-0000-4000-8000-000000000001', 'Maratona');
insert into public.activities (title, kind, subject_id, started_at, ended_at)
  values ('Dia inteiro', 'study', 'e0000000-0000-4000-8000-000000000001',
          '2026-11-01 00:00 America/New_York', '2026-11-02 00:00 America/New_York');
select is(
  (public.dashboard_summary('2026-11-01 12:00 America/New_York') -> 'studies' ->> 'actualMinutesToday')::int,
  1500, 'Dia do fim do horário de verão tem 25 h (1500 min) no fuso do perfil');
select is(
  (public.dashboard_summary('2026-11-01 12:00 America/New_York') ->> 'localDate'), '2026-11-01',
  'Dia local em Nova York');

-- ---------------------------------------------------------------------------
-- Exportação
-- ---------------------------------------------------------------------------
select tests.authenticate_as('dddddddd-0000-4000-8000-000000000001');
select is((public.export_my_data() ->> 'format'), 'lifeos-export', 'Exportação identifica o formato');
select is(jsonb_array_length(public.export_my_data() -> 'activities'), 5, 'Exportação traz todas as atividades de D');
select is(jsonb_array_length(public.export_my_data() -> 'tasks'), 11, 'Exportação traz todas as tarefas de D (8 avulsas + 3 do projeto)');
select is(jsonb_array_length(public.export_my_data() -> 'sessionPauses'), 1, 'Exportação traz as pausas');

-- ---------------------------------------------------------------------------
-- Exclusão da conta: remove tudo de D, nada de E
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.delete_my_account() $$, 'D exclui a própria conta');
select tests.clear_authentication();
select is((select count(*) from auth.users where id = 'dddddddd-0000-4000-8000-000000000001'), 0::bigint,
  'Usuário removido de auth.users');

create function tests.rows_owned_by(p_table regclass, p_column name, p_user uuid)
returns bigint language plpgsql as $$
declare v bigint;
begin
  execute format('select count(*) from %s where %I = $1', p_table, p_column) into v using p_user;
  return v;
end;
$$;

-- Varre o catálogo: toda tabela de public com user_id (e profiles.id).
select is(
  tests.rows_owned_by(c.oid, a.attname, 'dddddddd-0000-4000-8000-000000000001'), 0::bigint,
  format('Nenhum registro órfão de D em %s', c.relname))
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and not a.attisdropped
   and (a.attname = 'user_id' or (c.relname = 'profiles' and a.attname = 'id'))
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
 order by c.relname;
select is((select count(*) from public.activities where user_id = 'eeeeeeee-0000-4000-8000-000000000001'), 1::bigint,
  'Dados de E intactos');

select throws_ok(
  $$ select public.dashboard_summary() $$, '42501', 'Autenticação necessária',
  'Sem usuário no JWT, dashboard_summary recusa');

select * from finish();
rollback;
