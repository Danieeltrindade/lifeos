-- =============================================================================
-- LifeOS · 004 · Registro: categorias, atividades (tempo realizado), hábitos,
--                metas e diário
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorias de atividade (definidas pelo usuário)
-- -----------------------------------------------------------------------------
create table public.activity_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null
    constraint activity_categories_name_length check (char_length(btrim(name)) between 1 and 60),
  color text
    constraint activity_categories_color_hex check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_categories_id_user_unique unique (id, user_id)
);

create index activity_categories_user_idx on public.activity_categories (user_id);
create unique index activity_categories_user_name_active_key
  on public.activity_categories (user_id, lower(name)) where archived_at is null;

select private.secure_owned_table('public.activity_categories');

-- -----------------------------------------------------------------------------
-- Atividades: FONTE ÚNICA do tempo realizado (RN-03)
--   * source = 'timer'  → gerada pelo encerramento de uma sessão de foco;
--   * source = 'manual' → lançada pelo usuário.
-- duration_seconds é sempre calculada pelo servidor (trigger); o cliente não a define.
-- -----------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null
    constraint activities_title_length check (char_length(btrim(title)) between 1 and 200),
  category_id uuid,
  source text not null default 'manual'
    constraint activities_source_valid check (source in ('timer', 'manual')),
  session_id uuid
    constraint activities_one_per_session unique,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null default 0,
  subject_id uuid,
  topic_id uuid,
  task_id uuid,
  project_id uuid,
  notes text not null default ''
    constraint activities_notes_length check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_end_after_start check (ended_at > started_at),
  constraint activities_duration_within_span check (
    duration_seconds >= 0
    and duration_seconds <= ceil(extract(epoch from (ended_at - started_at)))
  ),
  constraint activities_source_matches_session check ((source = 'timer') = (session_id is not null)),
  -- Com tarefa, o projeto é o da tarefa (evita duas fontes para a mesma informação).
  constraint activities_task_or_project check (task_id is null or project_id is null),
  constraint activities_category_fk foreign key (category_id, user_id)
    references public.activity_categories (id, user_id) on delete set null (category_id),
  constraint activities_session_fk foreign key (session_id, user_id)
    references public.focus_sessions (id, user_id) on delete cascade,
  constraint activities_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id),
  constraint activities_topic_fk foreign key (topic_id, user_id)
    references public.topics (id, user_id) on delete set null (topic_id),
  constraint activities_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id),
  constraint activities_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete set null (project_id)
);

comment on table public.activities is
  'Tempo realizado (fatos). Planejamento (estimativas, eventos do calendário) nunca entra aqui (RN-02).';

create index activities_user_started_idx on public.activities (user_id, started_at desc);
-- Consultas por intervalo (recorte por dia local, sobreposição — RN-08).
create index activities_user_period_idx on public.activities
  using gist (user_id, tstzrange(started_at, ended_at, '[)'));
create index activities_subject_idx on public.activities (subject_id) where subject_id is not null;
create index activities_topic_idx on public.activities (topic_id) where topic_id is not null;
create index activities_task_idx on public.activities (task_id) where task_id is not null;
create index activities_project_idx on public.activities (project_id) where project_id is not null;
create index activities_category_idx on public.activities (category_id) where category_id is not null;

select private.secure_owned_table('public.activities');

create trigger activities_derive_subject before insert or update of topic_id, subject_id
  on public.activities for each row execute function private.derive_subject_from_topic();

-- Deriva origem, intervalo e duração. Para atividades de cronômetro, a sessão é a
-- fonte dos instantes e a duração líquida desconta as pausas (RN-04).
create function private.activities_derive_duration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions%rowtype;
begin
  if new.session_id is not null then
    select * into v_session from public.focus_sessions where id = new.session_id;
    if not found then
      return new; -- a FK composta rejeita sessões inexistentes ou alheias
    end if;
    if v_session.status <> 'completed' then
      raise exception 'Somente sessões encerradas geram atividades'
        using errcode = '23514', constraint = 'activities_session_completed';
    end if;
    new.source := 'timer';
    new.started_at := v_session.started_at;
    new.ended_at := v_session.ended_at;
    new.duration_seconds := private.focus_session_net_seconds(v_session.id);
  else
    new.source := 'manual';
    new.duration_seconds := greatest(0, floor(extract(epoch from (new.ended_at - new.started_at))))::integer;
  end if;
  return new;
end;
$$;

create trigger activities_derive_duration before insert or update on public.activities
  for each row execute function private.activities_derive_duration();

-- Máquina de estados da sessão: active → completed | discarded (sem volta).
create function private.focus_sessions_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'active' and new.status <> old.status then
    raise exception 'Sessão % não pode voltar a %', old.status, new.status
      using errcode = '23514', constraint = 'focus_sessions_status_transition';
  end if;
  return new;
end;
$$;

create trigger focus_sessions_status_transition before update of status on public.focus_sessions
  for each row execute function private.focus_sessions_status_transition();

-- Ao encerrar uma sessão, o banco gera a atividade correspondente (mesma transação).
-- Correções posteriores na sessão ou nas pausas recalculam a atividade.
create function private.focus_sessions_sync_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_subject_name text;
begin
  if new.status <> 'completed' then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' then
    -- Correção de instantes: o trigger da atividade recalcula tudo a partir da sessão.
    update public.activities set updated_at = pg_catalog.now() where session_id = new.id;
    return null;
  end if;

  select s.name into v_subject_name from public.subjects s where s.id = new.subject_id;
  insert into public.activities (user_id, title, session_id, started_at, ended_at, subject_id, topic_id, task_id)
  values (
    new.user_id,
    case when v_subject_name is null then 'Sessão de foco' else 'Sessão de foco — ' || v_subject_name end,
    new.id,
    new.started_at,
    new.ended_at,
    new.subject_id,
    new.topic_id,
    new.task_id
  );
  return null;
end;
$$;

create trigger focus_sessions_sync_activity after update of status, started_at, ended_at on public.focus_sessions
  for each row execute function private.focus_sessions_sync_activity();

create function private.session_pauses_sync_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session_id uuid := coalesce(new.session_id, old.session_id);
begin
  update public.activities set updated_at = pg_catalog.now() where session_id = v_session_id;
  return null;
end;
$$;

create trigger session_pauses_sync_activity after insert or update or delete on public.session_pauses
  for each row execute function private.session_pauses_sync_activity();

-- -----------------------------------------------------------------------------
-- Hábitos e marcações (RN-11: sequência é calculada, nunca armazenada)
-- -----------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null
    constraint habits_name_length check (char_length(btrim(name)) between 1 and 120),
  description text not null default ''
    constraint habits_description_length check (char_length(description) <= 2000),
  -- daily: todo dia · weekdays: dias fixos da semana · times_per_week: N vezes na semana
  schedule_kind text not null default 'daily'
    constraint habits_schedule_kind_valid check (schedule_kind in ('daily', 'weekdays', 'times_per_week')),
  -- 0 = domingo … 6 = sábado
  weekdays smallint[],
  times_per_week smallint,
  -- Meta por marcação, opcional (ex.: 20 páginas).
  target_value numeric(10, 2)
    constraint habits_target_positive check (target_value > 0),
  unit text
    constraint habits_unit_length check (char_length(btrim(unit)) between 1 and 30),
  start_on date not null default ((now() at time zone private.current_user_timezone())::date),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habits_id_user_unique unique (id, user_id),
  constraint habits_weekdays_match_kind check (
    (schedule_kind = 'weekdays') = (weekdays is not null)
    and (
      weekdays is null
      or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
    )
  ),
  constraint habits_times_match_kind check (
    (schedule_kind = 'times_per_week') = (times_per_week is not null)
    and (times_per_week is null or times_per_week between 1 and 7)
  ),
  constraint habits_target_has_unit check ((target_value is null) = (unit is null))
);

create index habits_user_idx on public.habits (user_id);
create index habits_user_active_idx on public.habits (user_id) where archived_at is null;

select private.secure_owned_table('public.habits');

create table public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  habit_id uuid not null,
  -- Dia no calendário do usuário.
  local_date date not null,
  value numeric(10, 2)
    constraint habit_checkins_value_non_negative check (value >= 0),
  note text not null default ''
    constraint habit_checkins_note_length check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_checkins_one_per_day unique (habit_id, local_date),
  constraint habit_checkins_habit_fk foreign key (habit_id, user_id)
    references public.habits (id, user_id) on delete cascade
);

create index habit_checkins_user_date_idx on public.habit_checkins (user_id, local_date desc);

select private.secure_owned_table('public.habit_checkins');

-- -----------------------------------------------------------------------------
-- Metas e marcos (RN-10)
--   * manual:          progresso informado pelo usuário (marcado como manual);
--   * activity_time:   horas de atividades no período, opcionalmente filtradas
--                      por UMA matéria, projeto ou categoria;
--   * habit_checkins:  número de marcações de um hábito no período.
-- Ligações de metas derivadas usam NO ACTION: não se exclui a fonte de uma meta
-- (arquive-a), mas a exclusão da conta remove tudo em cascata.
-- -----------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null
    constraint goals_title_length check (char_length(btrim(title)) between 1 and 200),
  description text not null default ''
    constraint goals_description_length check (char_length(description) <= 2000),
  status text not null default 'active'
    constraint goals_status_valid check (status in ('active', 'achieved', 'abandoned')),
  progress_mode text not null default 'manual'
    constraint goals_progress_mode_valid check (progress_mode in ('manual', 'activity_time', 'habit_checkins')),
  target_value numeric(12, 2) not null
    constraint goals_target_positive check (target_value > 0),
  unit text not null
    constraint goals_unit_length check (char_length(btrim(unit)) between 1 and 30),
  manual_current_value numeric(12, 2)
    constraint goals_manual_value_non_negative check (manual_current_value >= 0),
  subject_id uuid,
  project_id uuid,
  activity_category_id uuid,
  habit_id uuid,
  start_on date not null default ((now() at time zone private.current_user_timezone())::date),
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_id_user_unique unique (id, user_id),
  constraint goals_dates_ordered check (due_on is null or due_on >= start_on),
  constraint goals_manual_value_only_manual check (progress_mode = 'manual' or manual_current_value is null),
  constraint goals_sources_match_mode check (
    case progress_mode
      when 'manual' then num_nonnulls(subject_id, project_id, activity_category_id, habit_id) = 0
      when 'activity_time' then habit_id is null
        and num_nonnulls(subject_id, project_id, activity_category_id) <= 1
        and unit = 'h'
      when 'habit_checkins' then habit_id is not null
        and num_nonnulls(subject_id, project_id, activity_category_id) = 0
    end
  ),
  constraint goals_subject_fk foreign key (subject_id, user_id) references public.subjects (id, user_id),
  constraint goals_project_fk foreign key (project_id, user_id) references public.projects (id, user_id),
  constraint goals_category_fk foreign key (activity_category_id, user_id)
    references public.activity_categories (id, user_id),
  constraint goals_habit_fk foreign key (habit_id, user_id) references public.habits (id, user_id)
);

create index goals_user_idx on public.goals (user_id);
create index goals_user_active_idx on public.goals (user_id) where status = 'active';
create index goals_subject_idx on public.goals (subject_id) where subject_id is not null;
create index goals_project_idx on public.goals (project_id) where project_id is not null;
create index goals_category_idx on public.goals (activity_category_id) where activity_category_id is not null;
create index goals_habit_idx on public.goals (habit_id) where habit_id is not null;

select private.secure_owned_table('public.goals');

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  title text not null
    constraint goal_milestones_title_length check (char_length(btrim(title)) between 1 and 200),
  target_value numeric(12, 2)
    constraint goal_milestones_target_positive check (target_value > 0),
  due_on date,
  achieved_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_milestones_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade
);

create index goal_milestones_goal_idx on public.goal_milestones (goal_id, sort_order);
create index goal_milestones_user_idx on public.goal_milestones (user_id);

select private.secure_owned_table('public.goal_milestones');

-- -----------------------------------------------------------------------------
-- Diário (RN-12: uma entrada por dia local). Conteúdo privado: nunca entra em
-- evidências de recomendações, logs ou agregações.
-- -----------------------------------------------------------------------------
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  local_date date not null,
  content text not null default ''
    constraint diary_entries_content_length check (char_length(content) <= 100000),
  mood smallint
    constraint diary_entries_mood_range check (mood between 1 and 5),
  energy smallint
    constraint diary_entries_energy_range check (energy between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diary_entries_one_per_day unique (user_id, local_date)
);

comment on table public.diary_entries is 'Conteúdo privado. Acesso exclusivo do dono; excluído de qualquer agregação.';

select private.secure_owned_table('public.diary_entries');
