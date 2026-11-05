-- =============================================================================
-- 09 · Notas: categorias em dois níveis, exclusão protegida e imagens no Storage
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

select plan(22);

select tests.create_user('aaaaaaaa-0000-4000-8000-0000000000d1', 'ana-notas@example.test');
select tests.create_user('bbbbbbbb-0000-4000-8000-0000000000d1', 'bruno-notas@example.test');

select hasnt_table('public', 'diary_entries', 'O Diário foi removido');
select is((select public from storage.buckets where id = 'note-images'), false,
  'Bucket de imagens das notas é privado');

select tests.authenticate_as('aaaaaaaa-0000-4000-8000-0000000000d1');

-- Categorias e subcategorias (dois níveis)
insert into public.note_categories (id, name, color)
  values ('d0000000-0000-4000-8000-000000000001', 'Ideias', '#3b7ce5');
insert into public.note_categories (id, parent_id, name)
  values ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Projetos');
select lives_ok(
  $$ insert into public.note_categories (parent_id, name)
     values ('d0000000-0000-4000-8000-000000000001', 'Conteúdo') $$,
  'Categoria aceita várias subcategorias');
select throws_ok(
  $$ insert into public.note_categories (parent_id, name)
     values ('d0000000-0000-4000-8000-000000000002', 'Neta') $$,
  '23514', null, 'Subcategoria não tem subcategoria (dois níveis)');
select throws_ok(
  $$ insert into public.note_categories (parent_id, name)
     values ('d0000000-0000-4000-8000-000000000001', 'projetos') $$,
  '23505', null, 'Subcategorias irmãs não repetem nome');
select lives_ok(
  $$ insert into public.note_categories (name) values ('Projetos') $$,
  'O mesmo nome pode existir em outro nível');
insert into public.note_categories (id, name)
  values ('d0000000-0000-4000-8000-000000000003', 'Cantadas');
select throws_ok(
  $$ update public.note_categories set parent_id = 'd0000000-0000-4000-8000-000000000003'
      where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'Categoria com subcategorias não vira subcategoria');
select throws_ok(
  $$ insert into public.note_categories (name) values ('   ') $$,
  '23514', null, 'Nome da categoria não pode ficar vazio');

-- Notas
insert into public.notes (id, category_id, title, content, content_text)
  values ('d0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000002',
          'App de rotina', '{"type":"doc","content":[{"type":"paragraph"}]}', 'Juntar agenda e foco');
select throws_ok(
  $$ insert into public.notes (category_id, content) values ('d0000000-0000-4000-8000-000000000003', '[]') $$,
  '23514', null, 'Conteúdo precisa ser um documento do editor');
select throws_ok(
  $$ insert into public.notes (category_id, title) values ('d0000000-0000-4000-8000-000000000003', '  ') $$,
  '23514', null, 'Título, quando existe, não é vazio');

-- Exclusão protegida: categoria/subcategoria com notas não some com as notas.
select throws_ok(
  $$ delete from public.note_categories where id = 'd0000000-0000-4000-8000-000000000002' $$,
  '23503', null, 'Subcategoria com notas não é excluída (mova as notas antes)');
select throws_ok(
  $$ delete from public.note_categories where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '23503', null, 'Categoria cuja subcategoria tem notas não é excluída');
update public.notes set category_id = 'd0000000-0000-4000-8000-000000000003'
 where id = 'd0000000-0000-4000-8000-000000000010';
select lives_ok(
  $$ delete from public.note_categories where id = 'd0000000-0000-4000-8000-000000000001' $$,
  'Depois de mover as notas, a categoria sai junto com as subcategorias');
select is((select count(*)::int from public.note_categories
            where parent_id = 'd0000000-0000-4000-8000-000000000001'), 0,
  'Subcategorias da categoria excluída saem junto (cascata)');
select is((select count(*)::int from public.notes), 1, 'A nota movida continua existindo');

-- Imagens no Storage: cada conta só na própria pasta
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('note-images', 'aaaaaaaa-0000-4000-8000-0000000000d1/foto.webp', 'aaaaaaaa-0000-4000-8000-0000000000d1') $$,
  'A envia imagem para a própria pasta');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('note-images', 'bbbbbbbb-0000-4000-8000-0000000000d1/foto.webp', 'aaaaaaaa-0000-4000-8000-0000000000d1') $$,
  '42501', null, 'A não envia imagem para a pasta de B');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('note-images', 'foto-solta.webp') $$,
  '42501', null, 'Imagem fora de uma pasta de conta é recusada');

-- B não vê nem mexe em nada de A
select tests.authenticate_as('bbbbbbbb-0000-4000-8000-0000000000d1');
select is((select count(*)::int from public.notes), 0, 'B não vê as notas de A');
select is((select count(*)::int from public.note_categories), 0, 'B não vê as categorias de A');
select is((select count(*)::int from storage.objects where bucket_id = 'note-images'), 0,
  'B não vê as imagens de A');
delete from storage.objects where bucket_id = 'note-images';
select tests.clear_authentication();
select is((select count(*)::int from storage.objects where bucket_id = 'note-images'), 1,
  'B não apaga as imagens de A');

select * from finish();
rollback;
