-- =============================================================================
-- 06 · Fase 4: integração tarefa↔meta, estatísticas (pausas, meia-noite, alterações
--      retroativas, exclusões), ciclo de vida e deduplicação das recomendações,
--      planejamento, revisão semanal e exportação
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

select tests.create_user('99999999-0000-4000-8000-000000000001', 'gil@example.test',
  '{"display_name": "Gil", "timezone": "America/Sao_Paulo"}');
select tests.authenticate_as('99999999-0000-4000-8000-000000000001');

-- ===========================================================================
-- Cenário (setembro de 2026, fuso -03, sem horário de verão)
-- ===========================================================================
insert into public.subjects (id, name) values
  ('99000000-0000-4000-8000-000000000001', 'Matemática'),
  ('99000000-0000-4000-8000-000000000002', 'Física');
insert into public.topics (id, subject_id, name) values
  ('99000000-0000-4000-8000-000000000003', '99000000-0000-4000-8000-000000000001', 'Limites');

-- S1: 02/09 10:00–11:00, pausa 10:20–10:35 → 45 min líquidos
insert into public.focus_sessions (id, subject_id, topic_id, status, started_at, ended_at) values
  ('99000000-0000-4000-8000-000000000011', '99000000-0000-4000-8000-000000000001',
   '99000000-0000-4000-8000-000000000003', 'completed', '2026-09-02 10:00-03', '2026-09-02 11:00-03');
insert into public.session_pauses (session_id, started_at, ended_at) values
  ('99000000-0000-4000-8000-000000000011', '2026-09-02 10:20-03', '2026-09-02 10:35-03');
-- S2: 03/09 23:30 → 04/09 00:30, pausa 00:10–00:20 → 30 min no dia 3, 20 min no dia 4
insert into public.focus_sessions (id, subject_id, status, started_at, ended_at) values
  ('99000000-0000-4000-8000-000000000012', '99000000-0000-4000-8000-000000000001',
   'completed', '2026-09-03 23:30-03', '2026-09-04 00:30-03');
insert into public.session_pauses (session_id, started_at, ended_at) values
  ('99000000-0000-4000-8000-000000000012', '2026-09-04 00:10-03', '2026-09-04 00:20-03');
-- S3: começa ANTES do período (31/08 23:00) e termina 01/09 01:00
insert into public.focus_sessions (id, subject_id, status, started_at, ended_at) values
  ('99000000-0000-4000-8000-000000000013', '99000000-0000-4000-8000-000000000001',
   'completed', '2026-08-31 23:00-03', '2026-09-01 01:00-03');
-- M1: estudo lançado manualmente (sem sessão), Física, 05/09 08:00–09:00
insert into public.activities (id, title, kind, subject_id, started_at, ended_at) values
  ('99000000-0000-4000-8000-000000000014', 'Exercícios', 'study', '99000000-0000-4000-8000-000000000002',
   '2026-09-05 08:00-03', '2026-09-05 09:00-03');
insert into public.session_reflections (session_id, questions_count, correct_count) values
  ('99000000-0000-4000-8000-000000000011', 20, 15),
  ('99000000-0000-4000-8000-000000000012', 0, 0);

-- Outras atividades
insert into public.activity_categories (id, name) values ('99000000-0000-4000-8000-000000000020', 'Leitura');
insert into public.activities (title, kind, category_id, pages, reading_title, started_at, ended_at) values
  ('Dom Casmurro', 'reading', '99000000-0000-4000-8000-000000000020', 30, 'Dom Casmurro',
   '2026-09-06 20:00-03', '2026-09-06 21:00-03');
insert into public.activities (title, kind, distance_km, started_at, ended_at) values
  ('Corrida', 'exercise', 5.5, '2026-09-07 06:00-03', '2026-09-07 06:40-03');

-- Projeto, tarefas e marcos
insert into public.projects (id, name) values ('99000000-0000-4000-8000-000000000030', 'TCC');
insert into public.tasks (id, title, project_id, status, due_on, estimate_minutes, completed_at, created_at) values
  ('99000000-0000-4000-8000-000000000031', 'A', '99000000-0000-4000-8000-000000000030', 'done', '2026-09-02', 60,
   '2026-09-02 15:00-03', '2026-09-01 10:00-03'),
  ('99000000-0000-4000-8000-000000000032', 'B', null, 'done', '2026-09-03', 30,
   '2026-09-05 09:00-03', '2026-08-30 10:00-03'),
  ('99000000-0000-4000-8000-000000000033', 'C', '99000000-0000-4000-8000-000000000030', 'todo', '2026-09-04', null,
   null, '2026-08-30 10:00-03'),
  ('99000000-0000-4000-8000-000000000035', 'E', null, 'todo', '2099-10-30', null, null, '2026-08-30 10:00-03');
insert into public.tasks (id, title, status, due_on, cancelled_at, created_at) values
  ('99000000-0000-4000-8000-000000000034', 'D', 'cancelled', '2026-09-06', '2026-09-06 12:00-03',
   '2026-08-30 10:00-03');
-- Tempo REALIZADO na tarefa A: 90 min (atividade manual)
insert into public.activities (title, kind, task_id, started_at, ended_at) values
  ('Escrita', 'work', '99000000-0000-4000-8000-000000000031', '2026-09-02 13:00-03', '2026-09-02 14:30-03');
insert into public.project_milestones (project_id, title, due_on, completed_at) values
  ('99000000-0000-4000-8000-000000000030', 'Marco 1', '2026-09-03', null),
  ('99000000-0000-4000-8000-000000000030', 'Marco 2', '2026-09-05', '2026-09-04 18:00-03');

-- Revisões: duas tentativas no período e um adiamento registrado no período
insert into public.review_cards (id, topic_id, due_on) values
  ('99000000-0000-4000-8000-000000000040', '99000000-0000-4000-8000-000000000003', '2026-09-02');
insert into public.review_attempts (review_card_id, grade, reviewed_at) values
  ('99000000-0000-4000-8000-000000000040', 3, '2026-09-02 12:00-03'),
  ('99000000-0000-4000-8000-000000000040', 1, '2026-09-06 12:00-03');
insert into public.review_schedule_log (review_card_id, from_due_on, to_due_on, reason, changed_at) values
  ('99000000-0000-4000-8000-000000000040', '2026-09-03', '2026-09-04', 'postponed', '2026-09-03 08:00-03');

-- ===========================================================================
-- Estatísticas de estudo
-- ===========================================================================
create temporary table s on commit drop as select public.stats_study('2026-09-01', '2026-09-08') as j;
grant select on s to authenticated;

select is((select (j -> 'totals' ->> 'seconds')::int from s), 12900,
  'Estudo total = 60 (S3, parte de 01/09) + 45 (S1) + 50 (S2) + 60 (manual) = 215 min');
select is((select (j -> 'totals' ->> 'timerSeconds')::int from s), 9300, 'Parte vinda do cronômetro');
select is((select (j -> 'totals' ->> 'manualSeconds')::int from s), 3600, 'Parte lançada manualmente');
select is(
  (select jsonb_path_query_array(j, '$.days[*].seconds') from s),
  '[3600, 2700, 1800, 1200, 3600, 0, 0]'::jsonb,
  'Por dia: pausa descontada no dia em que ocorreu; a sessão da meia-noite se divide entre 03 e 04');
select is(
  (select jsonb_path_query_array(j, '$.days[*].sessions') from s),
  '[0, 1, 1, 0, 0, 0, 0]'::jsonb,
  'Sessões contadas no dia em que COMEÇARAM; S3 (iniciada antes do período) fica de fora');
select results_eq(
  $$ select (j -> 'sessions' ->> 'count')::int, (j -> 'sessions' ->> 'netSeconds')::int,
            (j -> 'sessions' ->> 'grossSeconds')::int from s $$,
  $$ values (2, 5700, 7200) $$,
  'Sessões do período: 2; líquido 95 min (pausas fora); bruto 120 min');
select results_eq(
  $$ select (j -> 'questions' ->> 'questions')::int, (j -> 'questions' ->> 'correct')::int,
            (j -> 'questions' ->> 'sessionsWithQuestions')::int from s $$,
  $$ values (20, 15, 1) $$, 'Questões e acertos das reflexões');
select is(
  (select x ->> 'seconds' from s, jsonb_array_elements(j -> 'bySubject') x
    where x ->> 'subjectId' = '99000000-0000-4000-8000-000000000001'), '9300',
  'Por matéria: Matemática 155 min');
select is(
  (select x ->> 'sessions' from s, jsonb_array_elements(j -> 'bySubject') x
    where x ->> 'subjectId' = '99000000-0000-4000-8000-000000000002'), '0',
  'Física: tempo manual, nenhuma sessão');
select is(
  (select j -> 'byTopic' -> 0 ->> 'seconds' from s), '2700', 'Por tópico: Limites 45 min');
select results_eq(
  $$ select (j -> 'reviews' ->> 'attempts')::int, (j -> 'reviews' -> 'byGrade' ->> '1')::int,
            (j -> 'reviews' -> 'byGrade' ->> '3')::int, (j -> 'reviews' ->> 'postponed')::int from s $$,
  $$ values (2, 1, 1, 1) $$, 'Revisões: tentativas por nota e adiamentos no período');

select throws_ok($$ select public.stats_study('2026-01-01', '2028-01-03') $$, '22023', null,
  'Intervalo acima de 731 dias é recusado');
select throws_ok($$ select public.stats_study('2026-09-08', '2026-09-01') $$, '22023', null,
  'Fim antes do início é recusado');

-- ===========================================================================
-- Atividades
-- ===========================================================================
create temporary table a on commit drop as select public.stats_activities('2026-09-01', '2026-09-08') as j;
grant select on a to authenticated;
select is((select (j -> 'totals' ->> 'count')::int from a), 6,
  'Atividades INICIADAS no período: 3 de estudo + trabalho + leitura + exercício (S3 começou antes)');
select is((select (j -> 'totals' ->> 'seconds')::int from a), 24300,
  'Tempo: 215 min de estudo + 90 + 60 + 40');
select results_eq(
  $$ select (j -> 'reading' ->> 'pages')::int, (j -> 'reading' ->> 'titles')::int,
            (j -> 'exercise' ->> 'distanceKm')::numeric from a $$,
  $$ values (30, 1, 5.5::numeric) $$, 'Métricas específicas: páginas, títulos, distância');
select is(
  (select x ->> 'count' from a, jsonb_array_elements(j -> 'byKind') x where x ->> 'kind' = 'study'), '3',
  'Por tipo: 3 atividades de estudo');
select is(
  (select x ->> 'seconds' from a, jsonb_array_elements(j -> 'byCategory') x
    where x ->> 'categoryId' = '99000000-0000-4000-8000-000000000020'), '3600',
  'Por categoria: Leitura 60 min');

-- ===========================================================================
-- Tarefas e projetos
-- ===========================================================================
create temporary table t on commit drop as select public.stats_tasks('2026-09-01', '2026-09-08') as j;
grant select on t to authenticated;
select results_eq(
  $$ select (j ->> 'created')::int, (j ->> 'completed')::int, (j ->> 'cancelled')::int from t $$,
  $$ values (1, 2, 1) $$, 'Criadas, concluídas e canceladas pelo instante do evento no período');
select results_eq(
  $$ select (j -> 'due' ->> 'total')::int, (j -> 'due' ->> 'cancelled')::int,
            (j -> 'due' ->> 'doneOnTime')::int, (j -> 'due' ->> 'doneLate')::int,
            (j -> 'due' ->> 'open')::int, (j -> 'due' ->> 'openOverdue')::int from t $$,
  $$ values (4, 1, 1, 1, 1, 1) $$,
  'Com prazo no período: 1 no prazo, 1 atrasada, 1 aberta (vencida), 1 cancelada');
select is(
  (select jsonb_path_query_array(j, '$.estimates[*] ? (@.taskId == "99000000-0000-4000-8000-000000000031").actualSeconds') from t),
  '[5400]'::jsonb, 'Estimado × realizado: tarefa A tem 90 min registrados (estimativa 60)');
select is(
  (select jsonb_array_length(j -> 'estimates') from t), 2,
  'Só tarefas concluídas no período COM estimativa entram na comparação');
select results_eq(
  $$ select (p ->> 'tasksTotal')::int, (p ->> 'tasksDone')::int, (p ->> 'tasksOverdue')::int,
            (p ->> 'milestonesDone')::int, (p ->> 'milestonesOverdue')::int
       from t, jsonb_array_elements(j -> 'projects') p $$,
  $$ values (2, 1, 1, 1, 1) $$, 'Projeto: tarefas, atrasos e marcos');
select is((select jsonb_array_length(j -> 'milestones') from t), 2, 'Marcos com prazo no período');

-- ===========================================================================
-- Metas: alvo em vigor em cada ciclo; tarefa ↔ meta
-- ===========================================================================
insert into public.goals (id, title, progress_mode, period, target_value, unit, subject_id, start_on) values
  ('99000000-0000-4000-8000-000000000050', 'Matemática semanal', 'activity_time', 'weekly', 2, 'h',
   '99000000-0000-4000-8000-000000000001', '2026-08-31');
update public.goals set target_value = 5 where id = '99000000-0000-4000-8000-000000000050';
select tests.clear_authentication();
update public.goal_changes set changed_at = '2026-09-10 12:00-03'
 where goal_id = '99000000-0000-4000-8000-000000000050';
select tests.authenticate_as('99999999-0000-4000-8000-000000000001');

create temporary table g on commit drop as select public.stats_goals('2026-09-01', '2026-09-15') as j;
grant select on g to authenticated;
select is(
  (select jsonb_path_query_array(x, '$.cycles[*].start') from g, jsonb_array_elements(j -> 'goals') x
    where x ->> 'goalId' = '99000000-0000-4000-8000-000000000050'),
  '["2026-08-31", "2026-09-07", "2026-09-14"]'::jsonb, 'Ciclos semanais que se sobrepõem ao período');
select is(
  (select jsonb_path_query_array(x, '$.cycles[*].target') from g, jsonb_array_elements(j -> 'goals') x
    where x ->> 'goalId' = '99000000-0000-4000-8000-000000000050'),
  '[2, 5, 5]'::jsonb, 'Ciclo antigo usa o alvo da época (2 h); mudar a meta não reescreve o passado');
select is(
  (select x -> 'cycles' -> 0 ->> 'value' from g, jsonb_array_elements(j -> 'goals') x
    where x ->> 'goalId' = '99000000-0000-4000-8000-000000000050'), '3.58',
  'Valor do 1º ciclo: 120 + 45 + 50 min de Matemática = 3,58 h');

insert into public.goals (id, title, progress_mode, period, target_value, unit, start_on, due_on, linked_tasks_only)
values ('99000000-0000-4000-8000-000000000051', 'Concluir tarefas do TCC', 'tasks_completed', 'once', 5, 'tarefas',
        '2026-09-01', '2026-09-30', true);
update public.tasks set goal_id = '99000000-0000-4000-8000-000000000051'
 where id = '99000000-0000-4000-8000-000000000031';
select is(
  (select x -> 'cycles' -> 0 ->> 'value'
     from jsonb_array_elements(public.stats_goals('2026-09-01', '2026-10-01') -> 'goals') x
    where x ->> 'goalId' = '99000000-0000-4000-8000-000000000051')::numeric, 1::numeric,
  'Meta "só tarefas vinculadas": conta a tarefa A (B foi concluída mas não está vinculada)');
select throws_ok(
  $$ insert into public.goals (title, progress_mode, target_value, unit, linked_tasks_only)
     values ('x', 'activity_time', 1, 'h', true) $$,
  '23514', null, '"Só tarefas vinculadas" vale apenas para metas de tarefas concluídas');
select is(
  (select seconds from public.task_time_totals(array['99000000-0000-4000-8000-000000000031'::uuid])), 5400::bigint,
  'task_time_totals: tempo realizado da tarefa A');

-- ===========================================================================
-- Alterações retroativas e exclusões refletem nas estatísticas
-- ===========================================================================
select public.correct_focus_session('99000000-0000-4000-8000-000000000011',
  '2026-09-02 10:00-03', '2026-09-02 10:30-03');
select is((public.stats_study('2026-09-01', '2026-09-08') -> 'totals' ->> 'seconds')::int, 11400,
  'Corrigir S1 para 10:00–10:30 (pausa recortada para 10:20–10:30) → 20 min: total cai 25 min');
delete from public.activities where id = '99000000-0000-4000-8000-000000000014';
select is((public.stats_study('2026-09-01', '2026-09-08') -> 'totals' ->> 'seconds')::int, 7800,
  'Excluir o lançamento manual de 60 min tira-o das estatísticas');
delete from public.focus_sessions where id = '99000000-0000-4000-8000-000000000012';
select results_eq(
  $$ select (public.stats_study('2026-09-01', '2026-09-08') -> 'sessions' ->> 'count')::int,
            (public.stats_study('2026-09-01', '2026-09-08') -> 'totals' ->> 'seconds')::int $$,
  $$ values (1, 4800) $$, 'Excluir uma sessão remove a sessão e a atividade gerada por ela');

-- ===========================================================================
-- Recomendações: ciclo de vida, deduplicação, período de espera
-- ===========================================================================
select tests.clear_authentication();
create function tests.cand(p_rule text, p_key text, p_title text default 'Título', p_cooldown int default 3)
returns jsonb language sql as $$
  select jsonb_build_object('ruleId', p_rule, 'dedupKey', p_key, 'title', p_title,
    'rationale', 'Porque sim (teste).', 'evidence', jsonb_build_object('n', 1), 'priority', 1,
    'action', jsonb_build_object('kind', 'navigate', 'to', '/tarefas', 'label', 'Abrir'),
    'cooldownDays', p_cooldown);
$$;
grant execute on function tests.cand(text, text, text, int) to authenticated;

create function tests.rec(p_rule text, p_key text)
returns public.recommendations language sql as $$
  select * from public.recommendations where rule_id = p_rule and dedup_key = p_key
   order by (closed_at is null) desc, closed_at desc limit 1;
$$;
grant execute on function tests.rec(text, text) to authenticated;
select tests.authenticate_as('99999999-0000-4000-8000-000000000001');

select throws_ok(
  $$ insert into public.recommendations (rule_id, title, rationale) values ('task.overdue', 'x', 'x') $$,
  '42501', null, 'O navegador não cria recomendações diretamente');

select is(
  (public.sync_recommendations(jsonb_build_array(tests.cand('task.overdue', 'task:1')), array['task.overdue']) ->> 'created')::int,
  1, 'A sincronização cria a recomendação da regra');
select is(
  (public.sync_recommendations(jsonb_build_array(tests.cand('task.overdue', 'task:1', 'Título novo')), array['task.overdue']) ->> 'created')::int,
  0, 'Deduplicação: a mesma regra e escopo não geram outra recomendação a cada atualização');
select is((select count(*) from public.recommendations where rule_id = 'task.overdue'), 1::bigint,
  'Continua existindo uma única recomendação');
select is((tests.rec('task.overdue', 'task:1')).title, 'Título novo', 'Os números/texto são atualizados');
select throws_ok(
  $$ update public.recommendations set rationale = 'outra' where rule_id = 'task.overdue' $$,
  '42501', null, 'A justificativa não é editável pelo navegador');

update public.recommendations set status = 'accepted' where rule_id = 'task.overdue';
select isnt((tests.rec('task.overdue', 'task:1')).decided_at, null, 'Aceitar registra a data da decisão');
select is(
  (public.sync_recommendations('[]'::jsonb, array['task.overdue']) ->> 'closed')::int, 1,
  'Quando a condição deixa de valer, a recomendação é encerrada');
select results_eq(
  $$ select status, close_reason from tests.rec('task.overdue', 'task:1') $$,
  $$ values ('resolved'::text, 'condition_cleared'::text) $$, 'Encerrada como "condição resolvida"');
select throws_ok(
  $$ update public.recommendations set status = 'pending' where rule_id = 'task.overdue' $$,
  '23514', null, 'Recomendação encerrada não reabre');

-- Regras não avaliadas não são encerradas.
select public.sync_recommendations(jsonb_build_array(tests.cand('review.overdue', 'all')), array['review.overdue']);
select is(
  (public.sync_recommendations('[]'::jsonb, array['task.overdue']) ->> 'closed')::int, 0,
  'Uma regra que não foi avaliada (dados insuficientes) não tem recomendações encerradas');
select throws_ok(
  $$ select public.sync_recommendations(jsonb_build_array(tests.cand('goal.stalled', 'g:1')), array['task.overdue']) $$,
  '22023', null, 'Candidata de regra não declarada como avaliada é recusada');

-- Rejeitar → período de espera.
update public.recommendations set status = 'dismissed', decision_note = 'Não se aplica'
 where rule_id = 'review.overdue';
select is((tests.rec('review.overdue', 'all')).close_reason, 'dismissed', 'Rejeitar encerra como rejeitada');
select is(
  (public.sync_recommendations(jsonb_build_array(tests.cand('review.overdue', 'all')), array['review.overdue']) ->> 'skippedCooldown')::int,
  1, 'Durante o período de espera, a regra não recria o que foi rejeitado');
select tests.clear_authentication();
update public.recommendations set closed_at = now() - interval '4 days' where rule_id = 'review.overdue';
select tests.authenticate_as('99999999-0000-4000-8000-000000000001');
select is(
  (public.sync_recommendations(jsonb_build_array(tests.cand('review.overdue', 'all')), array['review.overdue']) ->> 'created')::int,
  1, 'Depois do período de espera (3 dias), a condição ainda valendo gera uma nova recomendação');

-- Adiar.
select throws_ok(
  $$ update public.recommendations set status = 'snoozed', snoozed_until = now() + interval '40 days'
      where rule_id = 'review.overdue' and status = 'pending' $$,
  '22023', null, 'Adiar no máximo 30 dias');
update public.recommendations set status = 'snoozed', snoozed_until = now() + interval '2 days'
 where rule_id = 'review.overdue' and status = 'pending';
select is(
  (public.sync_recommendations(jsonb_build_array(tests.cand('review.overdue', 'all')), array['review.overdue']) ->> 'created')::int,
  0, 'Adiada continua sendo a mesma recomendação (sem duplicar)');
select is((tests.rec('review.overdue', 'all')).status, 'snoozed', 'Enquanto o prazo não passa, segue adiada');
select tests.clear_authentication();
update public.recommendations set snoozed_until = now() - interval '1 minute'
 where rule_id = 'review.overdue' and status = 'snoozed';
select tests.authenticate_as('99999999-0000-4000-8000-000000000001');
select public.sync_recommendations(jsonb_build_array(tests.cand('review.overdue', 'all')), array['review.overdue']);
select is((tests.rec('review.overdue', 'all')).status, 'pending', 'Adiamento vencido volta a pendente');

-- Resolver pelo usuário + expiração.
update public.recommendations set status = 'resolved' where rule_id = 'review.overdue' and status = 'pending';
select is((tests.rec('review.overdue', 'all')).close_reason, 'user_resolved', 'Marcar como resolvida');
select is(
  (public.sync_recommendations(
    jsonb_build_array(tests.cand('day.overload', 'day:2026-09-10') || jsonb_build_object('expiresAt', now() - interval '1 second')),
    array['day.overload']) ->> 'skippedExpired')::int,
  1, 'Candidata que já nasce vencida não é criada');
select public.sync_recommendations(
  jsonb_build_array(tests.cand('day.overload', 'day:2099-01-01') || jsonb_build_object('expiresAt', now() + interval '1 day')),
  array['day.overload']);
select tests.clear_authentication();
update public.recommendations set generated_at = now() - interval '2 days', expires_at = now() - interval '1 day'
 where rule_id = 'day.overload';
select tests.authenticate_as('99999999-0000-4000-8000-000000000001');
select is(
  (public.sync_recommendations(
    jsonb_build_array(tests.cand('day.overload', 'day:2099-01-01') || jsonb_build_object('expiresAt', now() - interval '1 day')),
    array['day.overload']) ->> 'expired')::int,
  1, 'Recomendação aberta cujo prazo passou expira');
select is((tests.rec('day.overload', 'day:2099-01-01')).close_reason, 'expired', 'Encerrada como expirada');
select ok(
  coalesce((select count(*) from public.recommendations where status in ('pending', 'snoozed', 'accepted')
     group by rule_id, dedup_key order by 1 desc limit 1), 0) <= 1
  and (select indisunique from pg_index where indexrelid = 'public.recommendations_one_open_per_scope'::regclass),
  'Nunca há duas recomendações abertas no mesmo escopo (índice único parcial)');

-- ===========================================================================
-- Planejamento e revisão semanal
-- ===========================================================================
insert into public.availability_windows (weekday, start_time, end_time) values (1, '08:00', '12:00');
select throws_ok(
  $$ insert into public.availability_windows (weekday, start_time, end_time) values (1, '11:00', '13:00') $$,
  '23P01', null, 'Janelas de disponibilidade do mesmo dia não se sobrepõem');
select lives_ok(
  $$ insert into public.availability_windows (weekday, start_time, end_time) values (1, '12:00', '13:00') $$,
  'Janelas encostadas são aceitas');
select throws_ok(
  $$ insert into public.planning_preferences (min_block_minutes, max_block_minutes) values (60, 30) $$,
  '23514', null, 'Bloco máximo não pode ser menor que o mínimo');
insert into public.weekly_reviews (week_start, notes) values ('2026-09-07', 'Semana boa de estudos.');
select throws_ok(
  $$ insert into public.weekly_reviews (week_start) values ('2026-09-07') $$,
  '23505', null, 'Uma revisão por semana');

-- ===========================================================================
-- Exportação cobre todas as tabelas
-- ===========================================================================
select is(
  (select count(*) from jsonb_each(public.export_my_data()) e where jsonb_typeof(e.value) = 'array'),
  (select count(*) - 1 from pg_tables where schemaname = 'public'),
  'A exportação traz uma lista para cada tabela de dados (o perfil vem como objeto)');

select tests.clear_authentication();
select * from finish();
rollback;
