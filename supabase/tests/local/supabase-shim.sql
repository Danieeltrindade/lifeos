-- =============================================================================
-- Shim do Supabase para validar migrations e testes em um PostgreSQL puro.
--
-- USO EXCLUSIVO EM AMBIENTE DE TESTE LOCAL (sem Docker). NÃO aplicar no Supabase:
-- lá esses objetos já existem e são gerenciados pela plataforma.
--
-- Reproduz apenas o que as migrations e os testes do LifeOS usam:
--   * papéis anon, authenticated, service_role (BYPASSRLS) e authenticator;
--   * schemas auth e extensions;
--   * auth.users (colunas usadas pelo trigger de perfil);
--   * auth.uid(), auth.jwt(), auth.role() com as mesmas definições do Supabase;
--   * privilégios padrão do schema public iguais aos de um projeto novo do Supabase
--     (anon e authenticated recebem tudo por padrão — as migrations precisam revogar).
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
    create role authenticator noinherit login;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Privilégios padrão de um projeto Supabase novo.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- pgTAP fica em extensions, como no Supabase (`create extension pgtap with schema extensions`).
create extension if not exists pgtap with schema extensions;
