-- =============================================================================
-- 08 · Paleta de cores por conta (profiles.theme_color)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.create_user(p_id uuid, p_email text)
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (p_id, p_email, '{}') returning id;
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

select plan(11);

select tests.create_user('aaaaaaaa-0000-4000-8000-0000000000c1', 'ana-cores@example.test');
select tests.create_user('bbbbbbbb-0000-4000-8000-0000000000c1', 'bruno-cores@example.test');

select col_not_null('public', 'profiles', 'theme_color', 'theme_color é obrigatória');
select col_default_is('public', 'profiles', 'theme_color', 'ocean', 'Padrão é ocean');
select is(
  (select theme_color from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000000c1'),
  'ocean', 'Conta nova começa com ocean');

select tests.authenticate_as('aaaaaaaa-0000-4000-8000-0000000000c1');
select lives_ok($$ update public.profiles set theme_color = 'nebula' $$,
  'Dono altera a própria paleta');
select throws_ok($$ update public.profiles set theme_color = 'neon' $$, '23514', null,
  'Paleta fora da lista é recusada');
select lives_ok($$ update public.profiles set theme_color = 'mono' $$,
  'A 11ª paleta (mono) é aceita');
update public.profiles set theme_color = 'nebula';
select lives_ok($$ update public.profiles set theme_preference = 'light' $$,
  'Modo claro/escuro continua independente da paleta');
select is((select theme_color from public.profiles), 'nebula',
  'Trocar o modo não altera a paleta');

-- B tenta alterar a paleta de A: o RLS filtra a linha (0 linhas afetadas, sem erro).
select tests.authenticate_as('bbbbbbbb-0000-4000-8000-0000000000c1');
update public.profiles set theme_color = 'gold' where id = 'aaaaaaaa-0000-4000-8000-0000000000c1';
select is((select count(*)::int from public.profiles), 1, 'B só enxerga o próprio perfil');
select tests.clear_authentication();
select is(
  (select theme_color from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000000c1'),
  'nebula', 'B não altera a paleta de A');
select is(
  (select theme_color from public.profiles where id = 'bbbbbbbb-0000-4000-8000-0000000000c1'),
  'ocean', 'A paleta de B continua a dele');

select * from finish();
rollback;
