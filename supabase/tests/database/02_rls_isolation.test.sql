-- =============================================================================
-- 02 · Isolamento entre usuários (RLS) — SELECT, INSERT, UPDATE, DELETE,
--      referências cruzadas, funções e acesso anônimo.
--
-- O usuário A cria ao menos uma linha em CADA tabela de public. O teste percorre
-- o catálogo: uma tabela nova sem dados de A aqui faz o teste falhar, obrigando a
-- cobri-la.
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

select tests.create_user('aaaaaaaa-0000-4000-8000-000000000001', 'ana@example.test');
select tests.create_user('bbbbbbbb-0000-4000-8000-000000000001', 'bruno@example.test');

-- ---------------------------------------------------------------------------
-- Dados de A (como o próprio A, via RLS)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-4000-8000-000000000001');

insert into public.projects (id, name) values ('a0000000-0000-4000-8000-000000000001', 'Projeto de A');
insert into public.tasks (id, title, project_id) values
  ('a0000000-0000-4000-8000-000000000002', 'Tarefa de A', 'a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000003', 'Outra tarefa de A', null);
insert into public.task_dependencies (task_id, depends_on_task_id)
  values ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002');
insert into public.subjects (id, name) values ('a0000000-0000-4000-8000-000000000004', 'Cálculo II');
insert into public.topics (id, subject_id, name)
  values ('a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000004', 'Integrais');
insert into public.learning_notes (id, subject_id, topic_id, title)
  values ('a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004',
          'a0000000-0000-4000-8000-000000000005', 'Resumo');
insert into public.focus_sessions (id, subject_id, started_at)
  values ('a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000004', '2026-10-20 10:00-03');
insert into public.session_pauses (id, session_id, started_at, ended_at)
  values ('a0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000007',
          '2026-10-20 10:20-03', '2026-10-20 10:35-03');
update public.focus_sessions set status = 'completed', ended_at = '2026-10-20 11:00-03'
 where id = 'a0000000-0000-4000-8000-000000000007';
insert into public.focus_sessions (id, started_at)
  values ('a0000000-0000-4000-8000-000000000022', '2026-10-20 12:00-03');
insert into public.review_cards (id, topic_id, due_on)
  values ('a0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000005', '2026-10-21');
insert into public.review_attempts (id, review_card_id, grade)
  values ('a0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000009', 3);
insert into public.activity_categories (id, name) values ('a0000000-0000-4000-8000-000000000011', 'Saúde');
insert into public.activities (id, title, category_id, started_at, ended_at)
  values ('a0000000-0000-4000-8000-000000000012', 'Caminhada', 'a0000000-0000-4000-8000-000000000011',
          '2026-10-20 07:00-03', '2026-10-20 07:30-03');
insert into public.habits (id, name) values ('a0000000-0000-4000-8000-000000000013', 'Ler');
insert into public.habit_checkins (id, habit_id, local_date)
  values ('a0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000013', '2026-10-20');
insert into public.goals (id, title, progress_mode, target_value, unit, subject_id)
  values ('a0000000-0000-4000-8000-000000000015', 'Estudar 60 h', 'activity_time', 60, 'h',
          'a0000000-0000-4000-8000-000000000004');
insert into public.goal_milestones (id, goal_id, title)
  values ('a0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000015', 'Metade');
insert into public.note_categories (id, name, color)
  values ('a0000000-0000-4000-8000-000000000017', 'Ideias', '#3b7ce5');
insert into public.notes (id, category_id, title, content_text)
  values ('a0000000-0000-4000-8000-000000000043', 'a0000000-0000-4000-8000-000000000017',
          'Ideia privada de A', 'Conteúdo privado de A');
insert into public.calendar_events (id, title, kind, starts_at, ends_at, subject_id, recurrence_rule)
  values ('a0000000-0000-4000-8000-000000000018', 'Estudo semanal', 'study',
          '2026-10-20 14:00-03', '2026-10-20 15:30-03', 'a0000000-0000-4000-8000-000000000004',
          'FREQ=WEEKLY;BYDAY=TU');
insert into public.calendar_event_exceptions (id, event_id, original_starts_at, kind)
  values ('a0000000-0000-4000-8000-000000000019', 'a0000000-0000-4000-8000-000000000018',
          '2026-10-27 14:00-03', 'cancelled');
insert into public.reminders (id, title, remind_at, task_id)
  values ('a0000000-0000-4000-8000-000000000020', 'Lembrar tarefa', '2026-10-21 09:00-03',
          'a0000000-0000-4000-8000-000000000002');
-- Fase 3
insert into public.project_milestones (id, project_id, title)
  values ('a0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000001', 'Entrega parcial');
insert into public.topic_mastery_events (id, topic_id, level, source)
  values ('a0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000005', 2, 'manual');
select public.save_session_reflection('a0000000-0000-4000-8000-000000000007', p_studied => 'Integrais',
  p_questions_count => 10, p_correct_count => 7);
insert into public.goals (id, title, target_value, unit)
  values ('a0000000-0000-4000-8000-000000000033', 'Ler 6 livros', 6, 'livros');
insert into public.goal_progress_entries (id, goal_id, amount)
  values ('a0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000033', 1);
update public.goals set target_value = 8 where id = 'a0000000-0000-4000-8000-000000000033';

-- Fase 4: disponibilidade, preferências, revisão semanal; tarefa ligada a meta.
insert into public.availability_windows (id, weekday, start_time, end_time)
  values ('a0000000-0000-4000-8000-000000000040', 1, '08:00', '12:00');
insert into public.planning_preferences (break_minutes) values (15);
insert into public.weekly_reviews (id, week_start, notes)
  values ('a0000000-0000-4000-8000-000000000041', '2026-10-19', 'Notas de A');
insert into public.weekly_review_priorities (id, review_id, title, task_id)
  values ('a0000000-0000-4000-8000-000000000042', 'a0000000-0000-4000-8000-000000000041', 'Prioridade de A',
          'a0000000-0000-4000-8000-000000000002');
update public.tasks set goal_id = 'a0000000-0000-4000-8000-000000000015'
 where id = 'a0000000-0000-4000-8000-000000000003';

-- Recomendações são geradas pelo sistema, não pelo navegador.
select tests.clear_authentication();
insert into public.recommendations (id, user_id, rule_id, title, rationale)
  values ('a0000000-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000001',
          'review.due', 'Revise Integrais', 'A revisão vence amanhã.');

-- ---------------------------------------------------------------------------
-- A vê os próprios dados em todas as tabelas (garante cobertura do fixture)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('aaaaaaaa-0000-4000-8000-000000000001');

select ok(tests.row_count(c.oid) > 0, format('A vê os próprios dados em %s', c.relname))
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
 order by c.relname;

-- ---------------------------------------------------------------------------
-- B não vê, não altera e não exclui nada de A
-- ---------------------------------------------------------------------------
select tests.authenticate_as('bbbbbbbb-0000-4000-8000-000000000001');

select is(tests.row_count(c.oid), 0::bigint, format('SELECT: B não vê linhas de A em %s', c.relname))
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'profiles'
 order by c.relname;

select results_eq(
  'select id from public.profiles',
  array['bbbbbbbb-0000-4000-8000-000000000001'::uuid],
  'SELECT: B vê somente o próprio perfil'
);

select cmp_ok(
  tests.affected_rows(format('update %s set updated_at = now()', c.oid::regclass)), '<=', 0::bigint,
  format('UPDATE: B não altera linhas de A em %s', c.relname))
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
 order by c.relname;

select cmp_ok(
  tests.affected_rows(format('delete from %s', c.oid::regclass)), '<=', 0::bigint,
  format('DELETE: B não exclui linhas de A em %s', c.relname))
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
 order by c.relname;

select is(
  tests.affected_rows($$ update public.profiles set display_name = 'invadido'
                          where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$),
  0::bigint, 'UPDATE: B não altera o perfil de A');

-- INSERT em nome de outro usuário
select throws_ok(
  $$ insert into public.projects (user_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'INSERT: B não cria projeto em nome de A');
select throws_ok(
  $$ insert into public.notes (user_id, category_id, content_text)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000017', 'x') $$,
  '42501', null, 'INSERT: B não escreve nas notas de A');
-- Nota própria de B apontando para a categoria de A: a FK composta recusa.
insert into public.note_categories (id, name) values ('b0000000-0000-4000-8000-000000000017', 'Minha');
select throws_ok(
  $$ insert into public.notes (category_id, content_text)
     values ('a0000000-0000-4000-8000-000000000017', 'x') $$,
  '23503', null, 'Referência cruzada: B não cria nota na categoria de A');
select throws_ok(
  $$ insert into public.note_categories (parent_id, name)
     values ('a0000000-0000-4000-8000-000000000017', 'Sub') $$,
  '23503', null, 'Referência cruzada: B não cria subcategoria dentro da categoria de A');
delete from public.note_categories where id = 'b0000000-0000-4000-8000-000000000017';
select throws_ok(
  $$ insert into public.activities (user_id, title, started_at, ended_at)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', '2026-10-20 08:00-03', '2026-10-20 09:00-03') $$,
  '42501', null, 'INSERT: B não lança atividade para A');

-- Referências cruzadas: registro próprio apontando para registro de A
select throws_ok(
  $$ insert into public.tasks (title, project_id) values ('Minha', 'a0000000-0000-4000-8000-000000000001') $$,
  '23503', null, 'FK: B não associa tarefa própria ao projeto de A');
select throws_ok(
  $$ insert into public.tasks (title, parent_task_id) values ('Sub', 'a0000000-0000-4000-8000-000000000002') $$,
  '23503', null, 'FK: B não cria subtarefa sob tarefa de A');
select throws_ok(
  $$ with t as (insert into public.tasks (title) values ('Minha') returning id)
     insert into public.task_dependencies (task_id, depends_on_task_id)
     select id, 'a0000000-0000-4000-8000-000000000002' from t $$,
  '23503', null, 'FK: B não cria dependência para tarefa de A');
select throws_ok(
  $$ insert into public.topics (subject_id, name) values ('a0000000-0000-4000-8000-000000000004', 'x') $$,
  '23503', null, 'FK: B não cria tópico na matéria de A');
select throws_ok(
  $$ insert into public.learning_notes (subject_id, title) values ('a0000000-0000-4000-8000-000000000004', 'x') $$,
  '23503', null, 'FK: B não anota na matéria de A');
select throws_ok(
  $$ select public.start_focus_session(p_subject_id => 'a0000000-0000-4000-8000-000000000004') $$,
  '23503', null, 'FK: B não inicia sessão na matéria de A');
select throws_ok(
  $$ insert into public.session_pauses (session_id) values ('a0000000-0000-4000-8000-000000000022') $$,
  '23503', null, 'FK: B não pausa sessão de A');
select throws_ok(
  $$ insert into public.review_attempts (review_card_id, grade) values ('a0000000-0000-4000-8000-000000000009', 3) $$,
  '23503', null, 'FK: B não registra tentativa no cartão de A');
select throws_ok(
  $$ insert into public.activities (title, started_at, ended_at, task_id)
     values ('x', '2026-10-20 08:00-03', '2026-10-20 09:00-03', 'a0000000-0000-4000-8000-000000000002') $$,
  '23503', null, 'FK: B não atribui tempo à tarefa de A');
select throws_ok(
  $$ insert into public.activities (title, started_at, ended_at, category_id)
     values ('x', '2026-10-20 08:00-03', '2026-10-20 09:00-03', 'a0000000-0000-4000-8000-000000000011') $$,
  '23503', null, 'FK: B não usa a categoria de A');
select throws_ok(
  $$ insert into public.habit_checkins (habit_id, local_date) values ('a0000000-0000-4000-8000-000000000013', '2026-10-21') $$,
  '23503', null, 'FK: B não marca o hábito de A');
select throws_ok(
  $$ insert into public.goals (title, progress_mode, target_value, unit, habit_id)
     values ('x', 'habit_checkins', 10, 'vezes', 'a0000000-0000-4000-8000-000000000013') $$,
  '23503', null, 'FK: B não cria meta sobre o hábito de A');
select throws_ok(
  $$ insert into public.goal_milestones (goal_id, title) values ('a0000000-0000-4000-8000-000000000015', 'x') $$,
  '23503', null, 'FK: B não cria marco na meta de A');
select throws_ok(
  $$ insert into public.calendar_event_exceptions (event_id, original_starts_at, kind)
     values ('a0000000-0000-4000-8000-000000000018', '2026-11-03 14:00-03', 'cancelled') $$,
  '23503', null, 'FK: B não cancela ocorrência do evento de A');
select throws_ok(
  $$ insert into public.reminders (title, remind_at, task_id)
     values ('x', now(), 'a0000000-0000-4000-8000-000000000002') $$,
  '23503', null, 'FK: B não cria lembrete na tarefa de A');
select throws_ok(
  $$ insert into public.calendar_events (title, starts_at, ends_at, subject_id)
     values ('x', '2026-10-20 08:00-03', '2026-10-20 09:00-03', 'a0000000-0000-4000-8000-000000000004') $$,
  '23503', null, 'FK: B não planeja evento na matéria de A');

select throws_ok(
  $$ insert into public.project_milestones (project_id, title) values ('a0000000-0000-4000-8000-000000000001', 'x') $$,
  '23503', null, 'FK: B não cria marco no projeto de A');
select throws_ok(
  $$ insert into public.topic_mastery_events (topic_id, level) values ('a0000000-0000-4000-8000-000000000005', 4) $$,
  '23503', null, 'FK: B não registra domínio no tópico de A');
select throws_ok(
  $$ insert into public.goal_progress_entries (goal_id, amount) values ('a0000000-0000-4000-8000-000000000033', 5) $$,
  '23503', null, 'FK: B não lança progresso na meta de A');
select throws_ok(
  $$ select public.save_session_reflection('a0000000-0000-4000-8000-000000000007', p_studied => 'x') $$,
  'P0002', 'Sessão não encontrada', 'RPC: B não grava reflexão na sessão de A');
select throws_ok(
  $$ select public.complete_review('a0000000-0000-4000-8000-000000000009', 3) $$,
  'P0002', 'Revisão não encontrada', 'RPC: B não conclui a revisão de A');
select throws_ok(
  $$ select public.postpone_review('a0000000-0000-4000-8000-000000000009', 2) $$,
  'P0002', null, 'RPC: B não adia a revisão de A');
select throws_ok(
  $$ select public.complete_task('a0000000-0000-4000-8000-000000000002') $$,
  'P0002', 'Tarefa não encontrada', 'RPC: B não conclui a tarefa de A');
select is((select count(*) from public.goal_progress()), 0::bigint, 'RPC: goal_progress de B não traz metas de A');
select throws_ok(
  $$ select * from public.goal_history('a0000000-0000-4000-8000-000000000015') $$,
  'P0002', 'Meta não encontrada', 'RPC: B não lê o histórico da meta de A');

select throws_ok(
  $$ insert into public.tasks (title, goal_id) values ('Minha', 'a0000000-0000-4000-8000-000000000015') $$,
  '23503', null, 'FK: B não liga tarefa própria à meta de A');
select throws_ok(
  $$ insert into public.calendar_events (title, starts_at, ends_at, category_id)
     values ('x', '2026-10-20 08:00-03', '2026-10-20 09:00-03', 'a0000000-0000-4000-8000-000000000011') $$,
  '23503', null, 'FK: B não usa a categoria de A num evento');
select throws_ok(
  $$ insert into public.weekly_review_priorities (review_id, title) values ('a0000000-0000-4000-8000-000000000041', 'x') $$,
  '23503', null, 'FK: B não adiciona prioridade à revisão semanal de A');
select throws_ok(
  $$ with r as (insert into public.weekly_reviews (week_start) values ('2026-10-19') returning id)
     insert into public.weekly_review_priorities (review_id, title, task_id)
     select id, 'x', 'a0000000-0000-4000-8000-000000000002' from r $$,
  '23503', null, 'FK: B não usa tarefa de A como prioridade');
select is(
  (public.stats_tasks('2026-10-01', '2026-11-01') ->> 'created')::int, 0,
  'RPC: estatísticas de B não contam tarefas de A');
select is(
  (public.stats_activities('2026-10-01', '2026-11-01') -> 'totals' ->> 'count')::int, 0,
  'RPC: estatísticas de atividades de B não contam as de A');
select is(
  (public.stats_study('2026-10-01', '2026-11-01') -> 'sessions' ->> 'count')::int, 0,
  'RPC: estatísticas de estudo de B não contam sessões de A');
select is(
  jsonb_array_length(public.stats_goals('2026-10-01', '2026-11-01') -> 'goals'), 0,
  'RPC: estatísticas de metas de B não incluem metas de A');
select is(
  (select count(*) from public.task_time_totals(array['a0000000-0000-4000-8000-000000000002'::uuid])), 0::bigint,
  'RPC: B não obtém o tempo de uma tarefa de A');
select is(
  (public.sync_recommendations('[]'::jsonb, array['review.overdue']) ->> 'closed')::int, 0,
  'RPC: a sincronização de B não encerra recomendações de A');

-- Funções: sem acesso indireto
select throws_ok(
  $$ select public.complete_focus_session('a0000000-0000-4000-8000-000000000022') $$,
  'P0002', 'Sessão não encontrada', 'RPC: B não encerra a sessão de A (e não descobre se ela existe)');
select throws_ok(
  $$ select public.pause_focus_session('a0000000-0000-4000-8000-000000000022') $$,
  'P0002', 'Sessão não encontrada', 'RPC: B não pausa a sessão de A');
select is(public.dashboard_summary('2026-10-20 15:00-03') -> 'recentActivities', '[]'::jsonb,
  'RPC: o dashboard de B não inclui atividades de A');
select is(public.dashboard_summary('2026-10-20 15:00-03') -> 'goals', '[]'::jsonb,
  'RPC: o dashboard de B não inclui metas de A');
select is(public.export_my_data() -> 'notes', '[]'::jsonb,
  'RPC: a exportação de B não inclui as notas de A');
select is(public.export_my_data() -> 'profile' ->> 'id', 'bbbbbbbb-0000-4000-8000-000000000001',
  'RPC: a exportação de B traz o perfil de B');
select is(public.export_my_data() -> 'activities', '[]'::jsonb,
  'RPC: a exportação de B não inclui atividades de A');

-- Dono não pode ser trocado
select tests.authenticate_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.tasks set user_id = 'bbbbbbbb-0000-4000-8000-000000000001'
      where id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'A não transfere uma tarefa para B');
select tests.clear_authentication();
select throws_ok(
  $$ update public.tasks set user_id = 'bbbbbbbb-0000-4000-8000-000000000001'
      where id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501', 'user_id é imutável', 'Nem com privilégio elevado user_id muda (trigger)');

-- ---------------------------------------------------------------------------
-- Anônimo (chave pública sem login) não lê nem executa nada
-- ---------------------------------------------------------------------------
select tests.authenticate_as_anon();
select throws_ok('select * from public.tasks', '42501', null, 'anon: sem acesso a tarefas');
select throws_ok('select * from public.notes', '42501', null, 'anon: sem acesso às notas');
select throws_ok('select * from public.profiles', '42501', null, 'anon: sem acesso a perfis');
select throws_ok('select public.dashboard_summary()', '42501', null, 'anon: não chama dashboard_summary');
select throws_ok('select public.export_my_data()', '42501', null, 'anon: não chama export_my_data');
select throws_ok('select public.delete_my_account()', '42501', null, 'anon: não chama delete_my_account');
select throws_ok('select public.start_focus_session()', '42501', null, 'anon: não inicia sessões');

select tests.clear_authentication();
select * from finish();
rollback;
