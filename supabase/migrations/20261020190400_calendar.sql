-- =============================================================================
-- LifeOS · 005 · Calendário: eventos planejados, recorrência e exceções
--
-- Tudo no calendário é PLANEJADO (RN-02). O que aconteceu de fato vive em activities.
--
-- Datas:
--   * evento com horário → starts_at/ends_at (timestamptz, instantes absolutos);
--   * evento de dia inteiro → start_date/end_date (date, fim EXCLUSIVO), que não
--     "andam" quando o fuso muda;
--   * timezone guarda o fuso em que o evento foi planejado: recorrências são
--     expandidas no horário local desse fuso (horário de verão incluído).
-- =============================================================================

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null
    constraint calendar_events_title_length check (char_length(btrim(title)) between 1 and 200),
  description text not null default ''
    constraint calendar_events_description_length check (char_length(description) <= 4000),
  kind text not null default 'event'
    constraint calendar_events_kind_valid check (kind in ('event', 'study', 'task', 'habit')),
  all_day boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  timezone text not null default private.current_user_timezone()
    constraint calendar_events_timezone_valid check (private.is_valid_timezone(timezone)),
  -- Regra RFC 5545 sem o prefixo "RRULE:", ex.: FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z
  recurrence_rule text
    constraint calendar_events_rrule_format check (
      char_length(recurrence_rule) <= 500
      and recurrence_rule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,:+-]+)*$'
    ),
  task_id uuid,
  subject_id uuid,
  habit_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_id_user_unique unique (id, user_id),
  constraint calendar_events_time_shape check (
    case when all_day
      then start_date is not null and end_date is not null and end_date > start_date
           and starts_at is null and ends_at is null
      else starts_at is not null and ends_at is not null and ends_at > starts_at
           and start_date is null and end_date is null
    end
  ),
  constraint calendar_events_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id),
  constraint calendar_events_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id),
  constraint calendar_events_habit_fk foreign key (habit_id, user_id)
    references public.habits (id, user_id) on delete set null (habit_id)
);

comment on table public.calendar_events is 'Blocos de tempo e compromissos PLANEJADOS (RN-02).';

create index calendar_events_user_idx on public.calendar_events (user_id);
create index calendar_events_user_timed_idx on public.calendar_events
  using gist (user_id, tstzrange(starts_at, ends_at, '[)')) where not all_day;
create index calendar_events_user_all_day_idx on public.calendar_events (user_id, start_date, end_date)
  where all_day;
create index calendar_events_user_recurring_idx on public.calendar_events (user_id)
  where recurrence_rule is not null;
create index calendar_events_task_idx on public.calendar_events (task_id) where task_id is not null;
create index calendar_events_subject_idx on public.calendar_events (subject_id) where subject_id is not null;
create index calendar_events_habit_idx on public.calendar_events (habit_id) where habit_id is not null;

select private.secure_owned_table('public.calendar_events');

-- Exceções de uma série recorrente: ocorrência cancelada ou alterada.
-- A ocorrência é identificada pelo seu início ORIGINAL (instante ou data).
create table public.calendar_event_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id uuid not null,
  original_starts_at timestamptz,
  original_date date,
  kind text not null
    constraint calendar_event_exceptions_kind_valid check (kind in ('cancelled', 'modified')),
  new_title text
    constraint calendar_event_exceptions_title_length check (char_length(btrim(new_title)) between 1 and 200),
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_exceptions_one_key check (num_nonnulls(original_starts_at, original_date) = 1),
  constraint calendar_event_exceptions_new_times check (
    (new_starts_at is null) = (new_ends_at is null) and (new_ends_at is null or new_ends_at > new_starts_at)
  ),
  constraint calendar_event_exceptions_cancel_has_no_override check (
    kind = 'modified' or num_nonnulls(new_title, new_starts_at, new_ends_at) = 0
  ),
  constraint calendar_event_exceptions_unique_instant unique (event_id, original_starts_at),
  constraint calendar_event_exceptions_unique_date unique (event_id, original_date),
  constraint calendar_event_exceptions_event_fk foreign key (event_id, user_id)
    references public.calendar_events (id, user_id) on delete cascade
);

create index calendar_event_exceptions_user_idx on public.calendar_event_exceptions (user_id);

select private.secure_owned_table('public.calendar_event_exceptions');
