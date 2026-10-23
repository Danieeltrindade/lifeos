-- =============================================================================
-- Papéis e privilégios de um projeto Supabase novo, para a pilha local de testes
-- (supabase/stack/start.sh). NÃO aplicar no Supabase: lá isso já existe.
--
-- Diferente do shim de supabase/tests/local, aqui o schema `auth` é criado VAZIO e quem o
-- preenche são as migrations oficiais do Supabase Auth (GoTrue), como na plataforma.
-- =============================================================================

set client_min_messages = warning;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'authenticator-local';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin noinherit createrole login password 'auth-admin-local';
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth authorization supabase_auth_admin;
grant create on database :"dbname" to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;

-- Privilégios padrão de um projeto Supabase novo (anon/authenticated recebem tudo; as
-- migrations do LifeOS precisam revogar — é isso que os testes pgTAP conferem).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
