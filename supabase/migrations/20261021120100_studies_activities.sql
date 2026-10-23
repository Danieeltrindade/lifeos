-- =============================================================================
-- LifeOS · 009 · Fase 3 — Estudos, cronômetro e atividades
--
--  * Matérias: descrição, objetivo, carga semanal pretendida, status.
--  * Tópicos: subtópicos (um nível), descrição, prioridade, dificuldade percebida,
--    observações. O DOMÍNIO não é um campo editável: é um histórico
--    (topic_mastery_events), e ajustes manuais ficam registrados como tais.
--  * Sessões de foco: técnica de estudo, registro manual (inserir já encerrada),
--    validação de horários (nada no futuro, no máximo 24 h).
--  * Atividades: tipo (estudo, leitura, exercício…) com métricas específicas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Matérias
-- -----------------------------------------------------------------------------
alter table public.subjects
  add column description text not null default ''
    constraint subjects_description_length check (char_length(description) <= 2000),
  add column objective text not null default ''
    constraint subjects_objective_length check (char_length(objective) <= 500),
  -- Carga de estudo pretendida (planejamento, não fato).
  add column target_minutes_per_week integer
    constraint subjects_target_range check (target_minutes_per_week between 1 and 10080),
  add column status text not null default 'active'
    constraint subjects_status_valid check (status in ('active', 'paused', 'completed'));

-- -----------------------------------------------------------------------------
-- Tópicos e subtópicos
-- -----------------------------------------------------------------------------
alter table public.topics
  add column parent_topic_id uuid,
  add column description text not null default ''
    constraint topics_description_length check (char_length(description) <= 2000),
  add column priority text not null default 'medium'
    constraint topics_priority_valid check (priority in ('low', 'medium', 'high')),
  -- Dificuldade PERCEBIDA (1 = fácil … 5 = muito difícil).
  add column difficulty smallint
    constraint topics_difficulty_range check (difficulty between 1 and 5),
  add column notes text not null default ''
    constraint topics_notes_length check (char_length(notes) <= 10000),
  add constraint topics_not_own_parent check (parent_topic_id is distinct from id),
  add constraint topics_parent_fk foreign key (parent_topic_id, user_id)
    references public.topics (id, user_id) on delete cascade;

create index topics_parent_idx on public.topics (parent_topic_id) where parent_topic_id is not null;

-- Subtópico: mesma matéria do tópico-pai e um único nível.
create function private.topics_enforce_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.topics%rowtype;
begin
  if new.parent_topic_id is not null then
    select * into v_parent from public.topics where id = new.parent_topic_id;
    if found then
      if v_parent.parent_topic_id is not null then
        raise exception 'Subtópicos não podem ter subtópicos'
          using errcode = '23514', constraint = 'topics_single_level';
      end if;
      new.subject_id := v_parent.subject_id;
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.topics c where c.parent_topic_id = new.id) then
      raise exception 'Um tópico com subtópicos não pode virar subtópico'
        using errcode = '23514', constraint = 'topics_single_level';
    end if;
  end if;
  return new;
end;
$$;

create trigger topics_enforce_hierarchy before insert or update of parent_topic_id, subject_id on public.topics
  for each row execute function private.topics_enforce_hierarchy();

-- Mover um tópico de matéria leva os subtópicos junto.
create function private.topics_propagate_subject()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.topics set subject_id = new.subject_id
   where parent_topic_id = new.id and subject_id is distinct from new.subject_id;
  return null;
end;
$$;

create trigger topics_propagate_subject after update of subject_id on public.topics
  for each row when (old.subject_id is distinct from new.subject_id)
  execute function private.topics_propagate_subject();

-- Histórico de domínio de um tópico (0 = não sei … 4 = domino).
--   manual  → ajuste explícito do usuário (sempre identificado como manual);
--   session → derivado do aproveitamento em questões de uma sessão;
--   review  → derivado da nota de uma revisão.
-- O domínio atual é o registro mais recente; nada é sobrescrito.
-- review_attempts precisa de (id, user_id) único para a FK composta.
alter table public.review_attempts add constraint review_attempts_id_user_unique unique (id, user_id);

create table public.topic_mastery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  topic_id uuid not null,
  level smallint not null
    constraint topic_mastery_events_level_range check (level between 0 and 4),
  source text not null default 'manual'
    constraint topic_mastery_events_source_valid check (source in ('manual', 'session', 'review')),
  session_id uuid,
  review_attempt_id uuid,
  note text not null default ''
    constraint topic_mastery_events_note_length check (char_length(note) <= 500),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topic_mastery_events_topic_fk foreign key (topic_id, user_id)
    references public.topics (id, user_id) on delete cascade,
  constraint topic_mastery_events_session_fk foreign key (session_id, user_id)
    references public.focus_sessions (id, user_id) on delete cascade,
  constraint topic_mastery_events_attempt_fk foreign key (review_attempt_id, user_id)
    references public.review_attempts (id, user_id) on delete cascade,
  constraint topic_mastery_events_source_link check (
    case source
      when 'manual' then session_id is null and review_attempt_id is null
      when 'session' then session_id is not null and review_attempt_id is null
      when 'review' then review_attempt_id is not null and session_id is null
    end
  )
);

create index topic_mastery_events_topic_idx on public.topic_mastery_events (topic_id, recorded_at desc);
create index topic_mastery_events_user_idx on public.topic_mastery_events (user_id);
create index topic_mastery_events_session_idx on public.topic_mastery_events (session_id) where session_id is not null;
create index topic_mastery_events_attempt_idx on public.topic_mastery_events (review_attempt_id)
  where review_attempt_id is not null;

select private.secure_owned_table('public.topic_mastery_events');

-- -----------------------------------------------------------------------------
-- Sessões de foco
-- -----------------------------------------------------------------------------
alter table public.focus_sessions
  add column technique text not null default 'free'
    constraint focus_sessions_technique_valid check (technique in ('free', 'pomodoro', 'review', 'exercises', 'reading', 'video')),
  add constraint focus_sessions_max_duration check (ended_at is null or ended_at - started_at <= interval '24 hours');

comment on column public.focus_sessions.planned_seconds is
  'Meta de duração (Pomodoro ou personalizada). Planejamento: não entra no tempo realizado.';

-- Horários válidos: nada no futuro (tolerância de 5 min para relógios dessincronizados).
create function private.focus_sessions_validate_times()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit timestamptz := pg_catalog.now() + interval '5 minutes';
begin
  if new.started_at > v_limit or (new.ended_at is not null and new.ended_at > v_limit) then
    raise exception 'A sessão não pode terminar no futuro'
      using errcode = '23514', constraint = 'focus_sessions_not_in_future';
  end if;
  return new;
end;
$$;

create trigger focus_sessions_validate_times before insert or update of started_at, ended_at on public.focus_sessions
  for each row execute function private.focus_sessions_validate_times();

-- Sessão → atividade. Agora também para sessões REGISTRADAS MANUALMENTE (inseridas
-- já encerradas) e mantendo matéria/tópico/tarefa sincronizados nas correções.
create or replace function private.focus_sessions_sync_activity()
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
    update public.activities
       set subject_id = new.subject_id,
           topic_id = new.topic_id,
           task_id = new.task_id,
           updated_at = pg_catalog.now()
     where session_id = new.id;
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

drop trigger focus_sessions_sync_activity on public.focus_sessions;
create trigger focus_sessions_sync_activity
  after insert or update of status, started_at, ended_at, subject_id, topic_id, task_id
  on public.focus_sessions for each row execute function private.focus_sessions_sync_activity();

-- -----------------------------------------------------------------------------
-- Atividades: tipo e métricas específicas
-- -----------------------------------------------------------------------------
alter table public.activities
  add column kind text not null default 'other'
    constraint activities_kind_valid check (kind in ('study', 'reading', 'exercise', 'project', 'work', 'leisure', 'other')),
  add column pages integer
    constraint activities_pages_range check (pages between 0 and 10000),
  add column reading_title text
    constraint activities_reading_title_length check (char_length(btrim(reading_title)) between 1 and 200),
  add column distance_km numeric(7, 2)
    constraint activities_distance_range check (distance_km >= 0 and distance_km <= 1000),
  add column intensity smallint
    constraint activities_intensity_range check (intensity between 1 and 5),
  add constraint activities_reading_metrics_only_reading check (
    kind = 'reading' or (pages is null and reading_title is null)
  ),
  add constraint activities_exercise_metrics_only_exercise check (
    kind = 'exercise' or (distance_km is null and intensity is null)
  );

update public.activities set kind = 'study' where source = 'timer' or subject_id is not null;

-- Uma única noção de "estudo": matéria e tópico só existem em atividades de estudo.
alter table public.activities add constraint activities_subject_only_study check (
  kind = 'study' or (subject_id is null and topic_id is null)
);

create index activities_user_kind_idx on public.activities (user_id, kind, started_at desc);

-- Atividades de cronômetro são sempre do tipo "estudo".
create or replace function private.activities_derive_duration()
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
      return new;
    end if;
    if v_session.status <> 'completed' then
      raise exception 'Somente sessões encerradas geram atividades'
        using errcode = '23514', constraint = 'activities_session_completed';
    end if;
    new.source := 'timer';
    new.kind := 'study';
    new.pages := null;
    new.reading_title := null;
    new.distance_km := null;
    new.intensity := null;
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
