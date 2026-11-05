-- =============================================================================
-- Notas (substitui o Diário).
--
-- 1. O Diário é REMOVIDO por decisão do usuário, com os dados (public.diary_entries).
--    Antes de aplicar esta migration num projeto com dados, exporte-os em
--    Configurações → Conta e dados → "Exportar meus dados (JSON)".
-- 2. Notas organizadas em categorias criadas pelo usuário, com no máximo DOIS níveis
--    (categoria → subcategoria). Mesmo padrão de segurança das demais tabelas:
--    RLS do dono, user_id imutável e FKs compostas (id, user_id), que tornam impossível
--    ligar uma nota a uma categoria de outra conta.
-- 3. Imagens das notas ficam no Storage, num bucket PRIVADO ('note-images'), cada conta
--    na própria pasta (<user_id>/<arquivo>). Vídeos não são enviados: a nota guarda só
--    o link.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Diário removido
-- -----------------------------------------------------------------------------
drop table public.diary_entries;

-- -----------------------------------------------------------------------------
-- 2. Categorias e subcategorias
-- -----------------------------------------------------------------------------
create table public.note_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- null = categoria; preenchido = subcategoria daquela categoria.
  parent_id uuid,
  name text not null
    constraint note_categories_name_length check (char_length(btrim(name)) between 1 and 60)
    constraint note_categories_name_trimmed check (name = btrim(name)),
  color text not null default '#3b7ce5'
    constraint note_categories_color_hex check (color ~ '^#[0-9a-f]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_categories_id_user_unique unique (id, user_id),
  constraint note_categories_parent_fk foreign key (parent_id, user_id)
    references public.note_categories (id, user_id) on delete cascade,
  constraint note_categories_not_self check (parent_id is distinct from id)
);

comment on table public.note_categories is
  'Categorias (parent_id nulo) e subcategorias das notas, criadas pelo usuário. Dois níveis no máximo.';

-- Nomes únicos (sem diferenciar maiúsculas) entre irmãos.
create unique index note_categories_unique_root_name
  on public.note_categories (user_id, lower(name)) where parent_id is null;
create unique index note_categories_unique_child_name
  on public.note_categories (user_id, parent_id, lower(name)) where parent_id is not null;
create index note_categories_user_idx on public.note_categories (user_id);
create index note_categories_parent_idx on public.note_categories (parent_id);

select private.secure_owned_table('public.note_categories');

-- Dois níveis: a mãe de uma subcategoria tem que ser uma categoria (sem mãe), e uma
-- categoria que já tem subcategorias não pode virar subcategoria.
create function private.note_categories_enforce_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.note_categories c
       where c.id = new.parent_id and c.parent_id is not null
    ) then
      raise exception 'Subcategorias não podem ter subcategorias'
        using errcode = '23514', constraint = 'note_categories_two_levels';
    end if;
    if tg_op = 'UPDATE' and exists (
      select 1 from public.note_categories c where c.parent_id = new.id
    ) then
      raise exception 'Uma categoria com subcategorias não pode virar subcategoria'
        using errcode = '23514', constraint = 'note_categories_two_levels';
    end if;
  end if;
  return new;
end;
$$;

create trigger note_categories_enforce_depth
  before insert or update of parent_id on public.note_categories
  for each row execute function private.note_categories_enforce_depth();

-- -----------------------------------------------------------------------------
-- 3. Notas
-- -----------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category_id uuid not null,
  title text
    constraint notes_title_length check (title is null or char_length(btrim(title)) between 1 and 200),
  -- Documento do editor (JSON do TipTap/ProseMirror): títulos, listas, negrito, imagens…
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb
    constraint notes_content_is_doc check (jsonb_typeof(content) = 'object' and content ->> 'type' = 'doc')
    constraint notes_content_size check (octet_length(content::text) <= 1000000),
  -- Texto puro derivado do documento: busca, prévia nos cartões e "Copiar".
  content_text text not null default ''
    constraint notes_content_text_length check (char_length(content_text) <= 200000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Excluir uma categoria com notas é recusado: a interface pede para mover as notas antes.
  constraint notes_category_fk foreign key (category_id, user_id)
    references public.note_categories (id, user_id) on delete restrict
);

comment on table public.notes is
  'Notas livres do usuário, organizadas em categorias. Conteúdo privado: fora de estatísticas e recomendações.';

create index notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index notes_category_idx on public.notes (category_id);

select private.secure_owned_table('public.notes');

-- -----------------------------------------------------------------------------
-- 4. Imagens das notas (Storage, bucket privado; cada conta só na própria pasta)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', false, 5242880,
        array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "note-images: dono lê" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note-images: dono envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note-images: dono altera" on storage.objects
  for update to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note-images: dono exclui" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 5. Exportação: sem o Diário, com as notas e categorias.
-- -----------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'format', 'lifeos-export',
    'version', 4,
    'exportedAt', pg_catalog.now(),
    'account', jsonb_build_object('id', v_uid, 'email', (select auth.jwt()) ->> 'email'),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'planningPreferences', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.planning_preferences x),
    'availabilityWindows', (select coalesce(jsonb_agg(to_jsonb(x) order by x.weekday, x.start_time), '[]') from public.availability_windows x),
    'projects', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.projects x),
    'projectMilestones', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from public.project_milestones x),
    'projectStatusHistory', (select coalesce(jsonb_agg(to_jsonb(x) order by x.changed_at), '[]') from public.project_status_history x),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.tasks x),
    'taskDependencies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.task_dependencies x),
    'subjects', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.subjects x),
    'topics', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.topics x),
    'topicMasteryEvents', (select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at), '[]') from public.topic_mastery_events x),
    'learningNotes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.learning_notes x),
    'focusSessions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]') from public.focus_sessions x),
    'sessionPauses', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]') from public.session_pauses x),
    'sessionReflections', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.session_reflections x),
    'reviewCards', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.review_cards x),
    'reviewAttempts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.reviewed_at), '[]') from public.review_attempts x),
    'reviewScheduleLog', (select coalesce(jsonb_agg(to_jsonb(x) order by x.changed_at), '[]') from public.review_schedule_log x),
    'activityCategories', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.activity_categories x),
    'activities', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]') from public.activities x),
    'habits', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.habits x),
    'habitCheckins', (select coalesce(jsonb_agg(to_jsonb(x) order by x.local_date), '[]') from public.habit_checkins x),
    'goals', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.goals x),
    'goalProgressEntries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_on), '[]') from public.goal_progress_entries x),
    'goalChanges', (select coalesce(jsonb_agg(to_jsonb(x) order by x.changed_at), '[]') from public.goal_changes x),
    'goalMilestones', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from public.goal_milestones x),
    'noteCategories', (select coalesce(jsonb_agg(to_jsonb(x) order by x.parent_id nulls first, x.position, x.created_at), '[]') from public.note_categories x),
    'notes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.notes x),
    'calendarEvents', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.calendar_events x),
    'calendarEventExceptions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.calendar_event_exceptions x),
    'recommendations', (select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at), '[]') from public.recommendations x),
    'reminders', (select coalesce(jsonb_agg(to_jsonb(x) order by x.remind_at), '[]') from public.reminders x),
    'weeklyReviews', (select coalesce(jsonb_agg(to_jsonb(x) order by x.week_start), '[]') from public.weekly_reviews x),
    'weeklyReviewPriorities', (select coalesce(jsonb_agg(to_jsonb(x) order by x.review_id, x.position), '[]') from public.weekly_review_priorities x)
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated, service_role;
