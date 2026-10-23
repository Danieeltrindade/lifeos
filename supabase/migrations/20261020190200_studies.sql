-- =============================================================================
-- LifeOS · 003 · Estudos: matérias, tópicos, anotações, sessões de foco, pausas
--                e revisões
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Matérias
-- -----------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null
    constraint subjects_name_length check (char_length(btrim(name)) between 1 and 120),
  color text
    constraint subjects_color_hex check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Período letivo livre, ex.: "2026.2".
  term text
    constraint subjects_term_length check (char_length(term) <= 40),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_id_user_unique unique (id, user_id)
);

create index subjects_user_idx on public.subjects (user_id);
create unique index subjects_user_name_active_key on public.subjects (user_id, lower(name))
  where archived_at is null;

select private.secure_owned_table('public.subjects');

-- -----------------------------------------------------------------------------
-- Tópicos de uma matéria
-- -----------------------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id uuid not null,
  name text not null
    constraint topics_name_length check (char_length(btrim(name)) between 1 and 200),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topics_id_user_unique unique (id, user_id),
  constraint topics_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete cascade
);

create index topics_user_idx on public.topics (user_id);
create index topics_subject_idx on public.topics (subject_id);
create unique index topics_subject_name_active_key on public.topics (subject_id, lower(name))
  where archived_at is null;

select private.secure_owned_table('public.topics');

-- Em tabelas com subject_id e topic_id, a matéria é derivada do tópico quando há
-- tópico: impede combinações incoerentes (tópico de uma matéria, sessão em outra).
create function private.derive_subject_from_topic()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  if new.topic_id is not null then
    select t.subject_id into v_subject from public.topics t where t.id = new.topic_id;
    -- Tópico inexistente ou alheio: a FK composta (topic_id, user_id) rejeita.
    if found then
      new.subject_id := v_subject;
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Anotações de aprendizado
-- -----------------------------------------------------------------------------
create table public.learning_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id uuid not null,
  topic_id uuid,
  title text not null
    constraint learning_notes_title_length check (char_length(btrim(title)) between 1 and 200),
  -- Markdown.
  content text not null default ''
    constraint learning_notes_content_length check (char_length(content) <= 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_notes_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete cascade,
  constraint learning_notes_topic_fk foreign key (topic_id, user_id)
    references public.topics (id, user_id) on delete set null (topic_id)
);

create index learning_notes_user_idx on public.learning_notes (user_id);
create index learning_notes_subject_idx on public.learning_notes (subject_id);
create index learning_notes_topic_idx on public.learning_notes (topic_id) where topic_id is not null;

select private.secure_owned_table('public.learning_notes');

create trigger learning_notes_derive_subject before insert or update of topic_id, subject_id
  on public.learning_notes for each row execute function private.derive_subject_from_topic();

-- -----------------------------------------------------------------------------
-- Sessões de foco (cronômetro) — RN-04, RN-05, RN-06, RN-07
--
-- O cronômetro é derivado de instantes persistidos: decorrido = agora − início − pausas.
-- "Pausada" não é um status armazenado: uma sessão está pausada quando tem uma pausa
-- aberta (fonte única de verdade).
-- -----------------------------------------------------------------------------
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id uuid,
  topic_id uuid,
  task_id uuid,
  status text not null default 'active'
    constraint focus_sessions_status_valid check (status in ('active', 'completed', 'discarded')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Meta da sessão (ex.: pomodoro de 25 min). É planejamento, não fato.
  planned_seconds integer
    constraint focus_sessions_planned_range check (planned_seconds between 60 and 86400),
  note text not null default ''
    constraint focus_sessions_note_length check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint focus_sessions_id_user_unique unique (id, user_id),
  constraint focus_sessions_end_matches_status check ((status = 'active') = (ended_at is null)),
  constraint focus_sessions_end_after_start check (ended_at is null or ended_at > started_at),
  constraint focus_sessions_subject_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id),
  constraint focus_sessions_topic_fk foreign key (topic_id, user_id)
    references public.topics (id, user_id) on delete set null (topic_id),
  constraint focus_sessions_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id)
);

-- RN-06: no máximo uma sessão ativa por usuário.
create unique index focus_sessions_one_active_per_user on public.focus_sessions (user_id)
  where status = 'active';
create index focus_sessions_user_started_idx on public.focus_sessions (user_id, started_at desc);
create index focus_sessions_subject_idx on public.focus_sessions (subject_id) where subject_id is not null;
create index focus_sessions_topic_idx on public.focus_sessions (topic_id) where topic_id is not null;
create index focus_sessions_task_idx on public.focus_sessions (task_id) where task_id is not null;

select private.secure_owned_table('public.focus_sessions');

create trigger focus_sessions_derive_subject before insert or update of topic_id, subject_id
  on public.focus_sessions for each row execute function private.derive_subject_from_topic();

-- -----------------------------------------------------------------------------
-- Pausas de uma sessão
-- -----------------------------------------------------------------------------
create table public.session_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  session_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_pauses_end_after_start check (ended_at is null or ended_at >= started_at),
  constraint session_pauses_session_fk foreign key (session_id, user_id)
    references public.focus_sessions (id, user_id) on delete cascade,
  -- Pausas de uma mesma sessão não se sobrepõem (pausa aberta = até o infinito).
  constraint session_pauses_no_overlap exclude using gist (
    session_id with =,
    tstzrange(started_at, ended_at, '[)') with &&
  )
);

-- RN-05: no máximo uma pausa aberta por sessão.
create unique index session_pauses_one_open_per_session on public.session_pauses (session_id)
  where ended_at is null;
create index session_pauses_user_idx on public.session_pauses (user_id);

select private.secure_owned_table('public.session_pauses');

-- Pausas precisam estar dentro do intervalo da sessão.
create function private.session_pauses_within_session()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions%rowtype;
begin
  select * into v_session from public.focus_sessions where id = new.session_id;
  if not found then
    return new; -- a FK composta rejeita sessões inexistentes ou alheias
  end if;
  if new.started_at < v_session.started_at then
    raise exception 'A pausa começa antes da sessão'
      using errcode = '23514', constraint = 'session_pauses_within_session';
  end if;
  if v_session.ended_at is not null and (new.ended_at is null or new.ended_at > v_session.ended_at) then
    raise exception 'A pausa precisa terminar até o fim da sessão'
      using errcode = '23514', constraint = 'session_pauses_within_session';
  end if;
  return new;
end;
$$;

create trigger session_pauses_within_session before insert or update on public.session_pauses
  for each row execute function private.session_pauses_within_session();

-- E a sessão não pode ser encurtada para deixar pausas de fora (RN-05).
create function private.focus_sessions_keep_pauses_inside()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.session_pauses p
     where p.session_id = new.id
       and (
         p.started_at < new.started_at
         or (new.ended_at is not null and (p.ended_at is null or p.ended_at > new.ended_at))
       )
  ) then
    raise exception 'Há pausas fora do intervalo da sessão; encerre a pausa antes de encerrar a sessão'
      using errcode = '23514', constraint = 'session_pauses_within_session';
  end if;
  return new;
end;
$$;

create trigger focus_sessions_keep_pauses_inside before update of started_at, ended_at on public.focus_sessions
  for each row execute function private.focus_sessions_keep_pauses_inside();

-- RN-04: duração líquida = (fim − início) − Σ pausas, nunca negativa.
create function private.focus_session_net_seconds(p_session_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
    0,
    floor(
      extract(epoch from (s.ended_at - s.started_at))
      - coalesce((
          select sum(extract(epoch from (least(p.ended_at, s.ended_at) - greatest(p.started_at, s.started_at))))
            from public.session_pauses p
           where p.session_id = s.id
             and p.ended_at is not null
        ), 0)
    )
  )::integer
  from public.focus_sessions s
  where s.id = p_session_id and s.ended_at is not null;
$$;

grant execute on function private.focus_session_net_seconds(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Revisões espaçadas: um cartão por tópico (estado planejado) + tentativas (fatos)
-- O algoritmo (SM-2, FSRS…) é decidido na Fase 5; colunas específicas entram por
-- migration nova.
-- -----------------------------------------------------------------------------
create table public.review_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  topic_id uuid not null,
  status text not null default 'active'
    constraint review_cards_status_valid check (status in ('active', 'suspended')),
  -- Próxima revisão no calendário do usuário.
  due_on date not null,
  interval_days integer not null default 0
    constraint review_cards_interval_non_negative check (interval_days >= 0),
  repetitions integer not null default 0
    constraint review_cards_repetitions_non_negative check (repetitions >= 0),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_cards_id_user_unique unique (id, user_id),
  constraint review_cards_one_per_topic unique (topic_id),
  constraint review_cards_topic_fk foreign key (topic_id, user_id)
    references public.topics (id, user_id) on delete cascade
);

create index review_cards_user_idx on public.review_cards (user_id);
create index review_cards_user_due_idx on public.review_cards (user_id, due_on) where status = 'active';

select private.secure_owned_table('public.review_cards');

create table public.review_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  review_card_id uuid not null,
  reviewed_at timestamptz not null default now(),
  -- 1 = errei · 2 = difícil · 3 = bom · 4 = fácil
  grade smallint not null
    constraint review_attempts_grade_range check (grade between 1 and 4),
  duration_seconds integer
    constraint review_attempts_duration_non_negative check (duration_seconds >= 0),
  notes text not null default ''
    constraint review_attempts_notes_length check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_attempts_card_fk foreign key (review_card_id, user_id)
    references public.review_cards (id, user_id) on delete cascade
);

create index review_attempts_card_idx on public.review_attempts (review_card_id, reviewed_at desc);
create index review_attempts_user_idx on public.review_attempts (user_id);

select private.secure_owned_table('public.review_attempts');
