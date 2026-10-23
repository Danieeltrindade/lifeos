-- =============================================================================
-- 01 · Catálogo de segurança: RLS, políticas, privilégios e funções
-- Verifica propriedades GERAIS do schema, para que tabelas e funções futuras não
-- escapem das regras por esquecimento.
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

select tables_are(
  'public',
  array[
    'profiles',
    'projects', 'project_milestones', 'project_status_history', 'tasks', 'task_dependencies',
    'subjects', 'topics', 'topic_mastery_events', 'learning_notes',
    'focus_sessions', 'session_pauses', 'session_reflections',
    'review_cards', 'review_attempts', 'review_schedule_log',
    'activity_categories', 'activities', 'habits', 'habit_checkins',
    'goals', 'goal_progress_entries', 'goal_changes', 'goal_milestones', 'diary_entries',
    'calendar_events', 'calendar_event_exceptions',
    'recommendations', 'reminders',
    'availability_windows', 'planning_preferences', 'weekly_reviews', 'weekly_review_priorities'
  ],
  'O schema public contém exatamente as tabelas previstas'
);

select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm') $$,
  'Não há views em public (views rodam com o dono e poderiam contornar o RLS)'
);

select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and not c.relrowsecurity $$,
  'Todas as tabelas de public têm RLS habilitado'
);

select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and (select count(*) from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname) <> 4 $$,
  'Toda tabela com user_id tem exatamente as 4 políticas do dono'
);

select is_empty(
  $$ select tablename, policyname from pg_policies
      where schemaname = 'public' and roles <> '{authenticated}'::name[] $$,
  'Nenhuma política vale para anon ou PUBLIC'
);

select is_empty(
  $$ select tablename, policyname from pg_policies
      where schemaname = 'public'
        and coalesce(qual, '') !~ '(user_id|id) = \( SELECT auth\.uid\(\)'
        and coalesce(with_check, '') !~ '(user_id|id) = \( SELECT auth\.uid\(\)' $$,
  'Toda política compara o dono com auth.uid()'
);

select is_empty(
  $$ select tablename, policyname from pg_policies
      where schemaname = 'public' and cmd in ('INSERT', 'UPDATE')
        and coalesce(with_check, '') !~ '(user_id|id) = \( SELECT auth\.uid\(\)' $$,
  'Políticas de INSERT e UPDATE têm WITH CHECK do dono (não é possível gravar em nome de outro)'
);

select is_empty(
  $$ select c.relname, priv
       from pg_class c
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
        and has_table_privilege('anon', c.oid, priv) $$,
  'anon não tem nenhum privilégio sobre tabelas de public'
);

select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and has_table_privilege('authenticated', c.oid, 'TRUNCATE') $$,
  'authenticated não pode TRUNCATE (ignora RLS)'
);

select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon não executa nenhuma função de public ou private'
);

select is(
  (select string_agg(p.proname::text, ',' order by p.proname::text) from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef),
  'delete_my_account,handle_new_user',
  'Somente as funções justificadas são SECURITY DEFINER'
);

select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c = 'search_path=""') $$,
  'Toda função de public/private fixa search_path vazio'
);

select ok(
  not has_function_privilege('authenticated', 'private.secure_owned_table(regclass)', 'EXECUTE'),
  'authenticated não executa o utilitário de migrations'
);
select ok(
  not has_function_privilege('authenticated', 'private.handle_new_user()', 'EXECUTE'),
  'authenticated não executa o trigger de cadastro diretamente'
);

select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'Perfis não são criados pelo navegador (apenas pelo trigger de cadastro)');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'Perfis não são excluídos pelo navegador (apenas com a conta)');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'O id do perfil não pode ser alterado');
select ok(has_column_privilege('authenticated', 'public.profiles', 'timezone', 'UPDATE'),
  'O fuso do perfil pode ser alterado pelo dono');

select ok(not has_table_privilege('authenticated', 'public.recommendations', 'INSERT'),
  'Recomendações não são criadas pelo navegador');
-- Fase 4: a sincronização roda como o próprio usuário (INVOKER), por isso o papel tem
-- privilégio de coluna; quem impede a escrita direta é o gatilho (testado em 03 e 06).
select has_trigger('public', 'recommendations', 'recommendations_guard',
  'O conteúdo das recomendações é protegido por gatilho (só o motor de regras escreve)');
select ok(has_column_privilege('authenticated', 'public.recommendations', 'status', 'UPDATE'),
  'O usuário registra sua decisão sobre a recomendação');

select is_empty(
  $$ select c.conrelid::regclass, c.conname
       from pg_constraint c
      where c.contype = 'f'
        and c.connamespace = 'public'::regnamespace
        and c.confrelid <> 'public.profiles'::regclass
        and c.confrelid <> 'auth.users'::regclass
        and not exists (
          select 1 from pg_attribute a
           where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'user_id') $$,
  'Toda FK entre tabelas de dados pessoais inclui user_id (FK composta impede ligar dados de outra conta)'
);

select is_empty(
  $$ select c.conrelid::regclass, c.conname, a.attname
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
           where i.indrelid = c.conrelid
             and i.indkey[0] = c.conkey[1]
             -- índice parcial "col IS NOT NULL" também atende à busca col = $1
             and (i.indpred is null
                  or pg_get_expr(i.indpred, i.indrelid) = format('(%s IS NOT NULL)', a.attname))) $$,
  'A primeira coluna de cada FK tem índice não parcial (exclusões em cascata não varrem a tabela)'
);

select * from finish();
rollback;
