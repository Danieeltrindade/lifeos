-- =============================================================================
-- LifeOS · 001 · Fundação: convenções, utilitários privados e perfis
--
-- Convenções (detalhes em docs/data-model.md):
--   * Toda tabela de dados pessoais tem user_id -> profiles(id) ON DELETE CASCADE,
--     RLS habilitado e quatro políticas "somente o dono" para o papel authenticated.
--   * anon não recebe nenhum privilégio sobre tabelas ou funções do LifeOS.
--   * Instantes em timestamptz; datas de calendário em date; o "dia" de um usuário é
--     definido pelo fuso IANA do perfil (RN-13).
--   * Funções com search_path = '' e nomes totalmente qualificados.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Privilégios padrão: objetos criados daqui em diante por quem roda as migrations
-- não ficam acessíveis a anon nem executáveis por PUBLIC sem concessão explícita.
-- -----------------------------------------------------------------------------
-- Observação: privilégios padrão POR SCHEMA só acrescentam permissões; o EXECUTE que
-- PUBLIC recebe em toda função nova só é retirado pela forma global (sem "in schema").
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- -----------------------------------------------------------------------------
-- Schema privado: utilitários usados por constraints, triggers e funções.
-- Não é exposto pela API (PostgREST expõe apenas public).
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Fuso IANA válido para o servidor PostgreSQL.
create function private.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_timezone is not null
     and exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone);
$$;

-- Auditoria e imutabilidade do dono em tabelas de dados pessoais.
--   * user_id e created_at não mudam depois da criação;
--   * updated_at é sempre o instante da transação.
create function private.protect_owned_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id é imutável'
      using errcode = '42501', hint = 'Registros não podem ser transferidos entre contas.';
  end if;
  new.created_at := old.created_at;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- Aplica o padrão de segurança de uma tabela de dados pessoais:
-- RLS + políticas do dono + privilégios mínimos + trigger de auditoria.
-- Usado apenas durante as migrations (não é executável pela API).
create function private.secure_owned_table(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := (select c.relname from pg_catalog.pg_class c where c.oid = p_table);
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('revoke all on table %s from public, anon, authenticated', p_table);
  execute format('grant select, insert, update, delete on table %s to authenticated', p_table);
  execute format('grant all on table %s to service_role', p_table);

  execute format(
    'create policy %I on %s for select to authenticated using (user_id = (select auth.uid()))',
    v_name || ': dono lê', p_table);
  execute format(
    'create policy %I on %s for insert to authenticated with check (user_id = (select auth.uid()))',
    v_name || ': dono cria', p_table);
  execute format(
    'create policy %I on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
    v_name || ': dono altera', p_table);
  execute format(
    'create policy %I on %s for delete to authenticated using (user_id = (select auth.uid()))',
    v_name || ': dono exclui', p_table);

  execute format(
    'create trigger protect_owned_row before update on %s for each row execute function private.protect_owned_row()',
    p_table);
end;
$$;

revoke all on function private.secure_owned_table(regclass) from public, anon, authenticated;
grant execute on function private.is_valid_timezone(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users) e preferências da conta.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ''
    constraint profiles_display_name_length check (char_length(display_name) <= 80)
    constraint profiles_display_name_trimmed check (display_name = btrim(display_name)),
  timezone text not null default 'UTC'
    constraint profiles_timezone_valid check (private.is_valid_timezone(timezone)),
  -- 0 = domingo … 6 = sábado (mesma convenção de Date.getDay()).
  week_starts_on smallint not null default 1
    constraint profiles_week_starts_on_range check (week_starts_on between 0 and 6),
  theme_preference text not null default 'system'
    constraint profiles_theme_preference_valid check (theme_preference in ('light', 'dark', 'system')),
  -- Preferência de notificação por e-mail (envio implementado em fase futura).
  email_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil e preferências da conta. Criado automaticamente no cadastro (trigger em auth.users).';

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
-- O perfil é criado pelo trigger de cadastro e removido junto com a conta:
-- o usuário só lê e altera colunas de preferência.
grant select on table public.profiles to authenticated;
grant update (display_name, timezone, week_starts_on, theme_preference, email_notifications)
  on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create policy "profiles: dono lê" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: dono altera" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function private.touch_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger touch_profile before update on public.profiles
  for each row execute function private.touch_profile();

-- Fuso do usuário autenticado (UTC se não houver perfil).
create function private.current_user_timezone()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select p.timezone from public.profiles p where p.id = (select auth.uid())),
    'UTC'
  );
$$;

grant execute on function private.current_user_timezone() to authenticated, service_role;

-- Cria o perfil no cadastro. SECURITY DEFINER porque roda no contexto do serviço de
-- autenticação (sem auth.uid()). Usa apenas metadados não sensíveis enviados no cadastro
-- e valida cada um; valores inválidos caem no padrão.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80);
  v_timezone text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    btrim(v_name),
    case when private.is_valid_timezone(v_timezone) then v_timezone else 'UTC' end
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
