-- =============================================================================
-- 07 · Fase 5: integridade nas exclusões
--
-- Monta um grafo completo de dados de UM usuário e exclui cada tipo de registro pelo mesmo
-- caminho do app (DELETE como "authenticated", sob RLS), conferindo que:
--   * a exclusão não falha por causa de triggers ou cascatas (bug da Fase 5: excluir uma
--     matéria com sessões ligadas a um tópico era recusado);
--   * o que deve sair sai (filhos em CASCADE) e o que deve ficar fica, sem o vínculo (SET NULL);
--   * as restrições deliberadas continuam (metas impedem excluir a própria fonte);
--   * as estatísticas acompanham a exclusão (o banco é a fonte da verdade).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

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

create function tests.clear_authentication()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select * from no_plan();

select tests.create_user('77777777-0000-4000-8000-000000000001', 'ivo@example.test',
  '{"display_name": "Ivo", "timezone": "America/Sao_Paulo"}');
select tests.authenticate_as('77777777-0000-4000-8000-000000000001');

-- ===========================================================================
-- Grafo de dados
-- ===========================================================================
insert into public.subjects (id, name) values ('77000000-0000-4000-8000-000000000001', 'Cálculo');
insert into public.topics (id, subject_id, name) values
  ('77000000-0000-4000-8000-000000000002', '77000000-0000-4000-8000-000000000001', 'Limites');
insert into public.topics (id, subject_id, parent_topic_id, name) values
  ('77000000-0000-4000-8000-000000000003', '77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000002', 'Limites laterais');
insert into public.learning_notes (subject_id, topic_id, title) values
  ('77000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000002', 'Resumo');
insert into public.topic_mastery_events (topic_id, level) values ('77000000-0000-4000-8000-000000000002', 2);
insert into public.review_cards (id, topic_id, due_on) values
  ('77000000-0000-4000-8000-000000000004', '77000000-0000-4000-8000-000000000002', '2026-09-10');
insert into public.review_attempts (review_card_id, grade, reviewed_at) values
  ('77000000-0000-4000-8000-000000000004', 3, '2026-09-10 12:00-03');

insert into public.projects (id, name) values ('77000000-0000-4000-8000-000000000010', 'TCC');
insert into public.project_milestones (project_id, title) values ('77000000-0000-4000-8000-000000000010', 'Qualificação');
insert into public.tasks (id, title, project_id) values
  ('77000000-0000-4000-8000-000000000011', 'Escrever', '77000000-0000-4000-8000-000000000010'),
  ('77000000-0000-4000-8000-000000000012', 'Revisar', '77000000-0000-4000-8000-000000000010');
insert into public.tasks (id, title, parent_task_id) values
  ('77000000-0000-4000-8000-000000000013', 'Subtarefa', '77000000-0000-4000-8000-000000000011');
insert into public.task_dependencies (task_id, depends_on_task_id) values
  ('77000000-0000-4000-8000-000000000012', '77000000-0000-4000-8000-000000000011');

-- Sessão com matéria, TÓPICO e tarefa (o caso do bug), com pausa e reflexão → gera atividade.
insert into public.focus_sessions (id, subject_id, topic_id, task_id, status, started_at, ended_at) values
  ('77000000-0000-4000-8000-000000000020', '77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000002', '77000000-0000-4000-8000-000000000011',
   'completed', '2026-09-10 10:00-03', '2026-09-10 11:00-03');
insert into public.session_pauses (session_id, started_at, ended_at) values
  ('77000000-0000-4000-8000-000000000020', '2026-09-10 10:20-03', '2026-09-10 10:30-03');
insert into public.session_reflections (session_id, questions_count, correct_count) values
  ('77000000-0000-4000-8000-000000000020', 10, 7);
-- Segunda sessão, só com matéria e subtópico (será excluída no fim)
insert into public.focus_sessions (id, subject_id, topic_id, status, started_at, ended_at) values
  ('77000000-0000-4000-8000-000000000021', '77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000003', 'completed', '2026-09-11 10:00-03', '2026-09-11 10:30-03');
-- Estudo lançado à mão, com matéria e tópico
insert into public.activities (id, title, kind, subject_id, topic_id, started_at, ended_at) values
  ('77000000-0000-4000-8000-000000000022', 'Lista', 'study', '77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000002', '2026-09-12 08:00-03', '2026-09-12 09:00-03');

insert into public.calendar_events (id, title, kind, starts_at, ends_at, subject_id, task_id, recurrence_rule) values
  ('77000000-0000-4000-8000-000000000030', 'Bloco', 'study', '2026-09-14 08:00-03', '2026-09-14 09:00-03',
   '77000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000011', 'FREQ=DAILY;COUNT=5');
insert into public.calendar_event_exceptions (event_id, kind, original_starts_at) values
  ('77000000-0000-4000-8000-000000000030', 'cancelled', '2026-09-15 08:00-03');

insert into public.habits (id, name, start_on) values ('77000000-0000-4000-8000-000000000040', 'Ler', '2026-09-01');
insert into public.habit_checkins (habit_id, local_date) values ('77000000-0000-4000-8000-000000000040', '2026-09-10');
insert into public.goals (id, title, progress_mode, period, target_value, unit, habit_id, start_on) values
  ('77000000-0000-4000-8000-000000000041', 'Ler sempre', 'habit_checkins', 'weekly', 5, 'vezes',
   '77000000-0000-4000-8000-000000000040', '2026-09-01');
insert into public.goals (id, title, progress_mode, period, target_value, unit, start_on) values
  ('77000000-0000-4000-8000-000000000042', 'Manual', 'manual', 'once', 10, 'x', '2026-09-01');
insert into public.goal_progress_entries (goal_id, amount, recorded_on) values
  ('77000000-0000-4000-8000-000000000042', 3, '2026-09-10');
insert into public.goal_milestones (goal_id, title) values ('77000000-0000-4000-8000-000000000042', 'Metade');
update public.goals set target_value = 12 where id = '77000000-0000-4000-8000-000000000042';

insert into public.weekly_reviews (id, week_start) values ('77000000-0000-4000-8000-000000000050', '2026-09-07');
insert into public.weekly_review_priorities (review_id, title, task_id) values
  ('77000000-0000-4000-8000-000000000050', 'Fechar capítulo', '77000000-0000-4000-8000-000000000012');

select is((select count(*)::int from public.activities where session_id is not null), 2,
  'Cenário: cada sessão encerrada gerou sua atividade');
select is((select (public.stats_study('2026-09-07', '2026-09-14') -> 'totals' ->> 'seconds')::int), 8400,
  'Cenário: 50 + 30 + 60 = 140 min de estudo na semana');

-- ===========================================================================
-- 1. Excluir a MATÉRIA (o bug): tópicos e revisões saem; sessões e estudo ficam sem vínculo
-- ===========================================================================
select lives_ok(
  $$ delete from public.subjects where id = '77000000-0000-4000-8000-000000000001' $$,
  'Excluir uma matéria com sessões ligadas a tópicos funciona');
select is((select count(*)::int from public.topics), 0, 'Tópicos e subtópicos saem com a matéria');
select is((select count(*)::int from public.review_cards), 0, 'Revisões saem com os tópicos');
select is((select count(*)::int from public.review_attempts), 0, 'Tentativas de revisão saem junto');
select is((select count(*)::int from public.learning_notes), 0, 'Anotações da matéria saem junto');
select is((select count(*)::int from public.topic_mastery_events), 0, 'Histórico de domínio sai junto');
select results_eq(
  $$ select count(*)::int, count(subject_id)::int, count(topic_id)::int from public.focus_sessions $$,
  $$ values (2, 0, 0) $$, 'As sessões ficam, sem matéria e sem tópico');
select results_eq(
  $$ select count(*)::int, count(subject_id)::int, count(topic_id)::int from public.activities where kind = 'study' $$,
  $$ values (3, 0, 0) $$, 'As atividades de estudo (das sessões e manual) ficam, sem vínculo');
select is(
  (select task_id from public.activities where session_id = '77000000-0000-4000-8000-000000000020'),
  '77000000-0000-4000-8000-000000000011'::uuid, 'O vínculo com a tarefa, que existe, é preservado');
select is((select count(*)::int from public.session_reflections), 1, 'Reflexões ficam com a sessão');
select is((select subject_id from public.calendar_events), null, 'O bloco do calendário fica, sem matéria');
select is((select (public.stats_study('2026-09-07', '2026-09-14') -> 'totals' ->> 'seconds')::int), 8400,
  'O tempo estudado continua nas estatísticas gerais');

-- ===========================================================================
-- 2. Excluir uma TAREFA com subtarefa, dependência, sessão, evento e prioridade semanal
-- ===========================================================================
select lives_ok(
  $$ delete from public.tasks where id = '77000000-0000-4000-8000-000000000011' $$,
  'Excluir uma tarefa com subtarefas, dependências, sessões e eventos funciona');
select is((select count(*)::int from public.tasks where id = '77000000-0000-4000-8000-000000000013'), 0,
  'Subtarefas saem com a tarefa-mãe');
select is((select count(*)::int from public.task_dependencies), 0, 'Dependências saem');
select is((select count(task_id)::int from public.focus_sessions), 0, 'Sessões ficam, sem a tarefa');
select is((select count(task_id)::int from public.activities), 0, 'Atividades ficam, sem a tarefa');
select is((select task_id from public.calendar_events), null, 'Evento fica, sem a tarefa');

-- ===========================================================================
-- 3. Excluir o PROJETO: tarefas ficam sem projeto; marcos e histórico saem
-- ===========================================================================
select lives_ok($$ delete from public.projects where id = '77000000-0000-4000-8000-000000000010' $$,
  'Excluir um projeto com tarefas funciona');
select results_eq($$ select count(*)::int, count(project_id)::int from public.tasks $$, $$ values (1, 0) $$,
  'A tarefa restante fica, sem projeto');
select is((select count(*)::int from public.project_milestones), 0, 'Marcos saem');
select is((select count(*)::int from public.project_status_history), 0, 'Histórico de status sai');

-- ===========================================================================
-- 4. Hábito ligado a meta: a exclusão é recusada de propósito (a meta perderia a fonte)
-- ===========================================================================
select throws_ok($$ delete from public.habits where id = '77000000-0000-4000-8000-000000000040' $$,
  '23503', null, 'Excluir um hábito usado por uma meta é recusado com erro claro');
select lives_ok($$ delete from public.goals where id = '77000000-0000-4000-8000-000000000041' $$,
  'Excluir a meta do hábito funciona');
select lives_ok($$ delete from public.habits where id = '77000000-0000-4000-8000-000000000040' $$,
  'Sem a meta, o hábito pode ser excluído');
select is((select count(*)::int from public.habit_checkins), 0, 'Marcações saem com o hábito');

-- ===========================================================================
-- 5. Meta com lançamentos, marcos e histórico de alterações
-- ===========================================================================
select ok((select count(*) from public.goal_changes) > 0, 'Cenário: a alteração do alvo ficou registrada');
select lives_ok($$ delete from public.goals where id = '77000000-0000-4000-8000-000000000042' $$,
  'Excluir uma meta com lançamentos funciona');
select results_eq(
  $$ select (select count(*)::int from public.goal_progress_entries), (select count(*)::int from public.goal_milestones),
            (select count(*)::int from public.goal_changes) $$,
  $$ values (0, 0, 0) $$, 'Lançamentos, marcos e histórico saem com a meta');

-- ===========================================================================
-- 6. Evento recorrente com exceção; revisão semanal com prioridades
-- ===========================================================================
select lives_ok($$ delete from public.calendar_events $$, 'Excluir um evento recorrente com exceções funciona');
select is((select count(*)::int from public.calendar_event_exceptions), 0, 'Exceções saem com o evento');
select lives_ok($$ delete from public.weekly_reviews $$, 'Excluir uma revisão semanal funciona');
select is((select count(*)::int from public.weekly_review_priorities), 0, 'Prioridades saem com a revisão');

-- ===========================================================================
-- 7. Excluir uma SESSÃO: pausas, reflexão e a atividade gerada saem; as estatísticas acompanham
-- ===========================================================================
select lives_ok($$ delete from public.focus_sessions where id = '77000000-0000-4000-8000-000000000020' $$,
  'Excluir uma sessão encerrada funciona');
select results_eq(
  $$ select (select count(*)::int from public.session_pauses), (select count(*)::int from public.session_reflections),
            (select count(*)::int from public.activities where session_id = '77000000-0000-4000-8000-000000000020') $$,
  $$ values (0, 0, 0) $$, 'Pausas, reflexão e a atividade da sessão saem');
select is((select (public.stats_study('2026-09-07', '2026-09-14') -> 'totals' ->> 'seconds')::int), 5400,
  'As estatísticas deixam de contar a sessão excluída (30 + 60 min)');

select tests.clear_authentication();
select * from finish();
rollback;
