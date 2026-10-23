-- =============================================================================
-- LifeOS · 010 · Fase 3 — Revisões espaçadas e reflexão pós-sessão
--
-- Regra de repetição espaçada (simples, documentada e testável — não se afirma
-- superioridade científica; ver docs/data-model.md §4.3 e ADR-025):
--   Escada de intervalos L = [1, 3, 7, 14, 30, 60, 120, 240] dias; r = acertos seguidos.
--     nota 1 (errei)   → r = 0;     intervalo = 1 dia
--     nota 2 (difícil) → r mantém;  intervalo = L[min(r, 7)]
--     nota 3 (bom)     → r = r + 1; intervalo = L[min(r, 7)]
--     nota 4 (fácil)   → r = r + 2; intervalo = L[min(r, 7)]
--   Próxima revisão = hoje (no fuso do perfil) + intervalo.
-- Toda mudança de data fica em review_schedule_log (concluir, adiar, reagendar).
-- =============================================================================

create function private.local_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.now() at time zone private.current_user_timezone())::date;
$$;

grant execute on function private.local_today() to authenticated, service_role;

alter table public.review_cards
  add column priority text not null default 'medium'
    constraint review_cards_priority_valid check (priority in ('low', 'medium', 'high'));

-- -----------------------------------------------------------------------------
-- Histórico de agendamento
-- -----------------------------------------------------------------------------
create table public.review_schedule_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  review_card_id uuid not null,
  from_due_on date,
  to_due_on date not null,
  reason text not null
    constraint review_schedule_log_reason_valid check (reason in ('created', 'completed', 'postponed', 'rescheduled', 'session')),
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_schedule_log_card_fk foreign key (review_card_id, user_id)
    references public.review_cards (id, user_id) on delete cascade
);

create index review_schedule_log_card_idx on public.review_schedule_log (review_card_id, changed_at desc);
create index review_schedule_log_user_idx on public.review_schedule_log (user_id);

select private.secure_owned_table('public.review_schedule_log');
revoke update on table public.review_schedule_log from authenticated;

-- O motivo vem da função que mudou a data (GUC local da transação); uma edição
-- direta da data conta como "reagendada".
create function private.review_cards_log_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reason text := nullif(pg_catalog.current_setting('lifeos.review_reason', true), '');
begin
  if tg_op = 'INSERT' or new.due_on is distinct from old.due_on then
    insert into public.review_schedule_log (user_id, review_card_id, from_due_on, to_due_on, reason)
    values (
      new.user_id,
      new.id,
      case when tg_op = 'UPDATE' then old.due_on end,
      new.due_on,
      coalesce(v_reason, case when tg_op = 'INSERT' then 'created' else 'rescheduled' end)
    );
  end if;
  return null;
end;
$$;

create trigger review_cards_log_schedule after insert or update of due_on on public.review_cards
  for each row execute function private.review_cards_log_schedule();

insert into public.review_schedule_log (user_id, review_card_id, from_due_on, to_due_on, reason, changed_at)
select c.user_id, c.id, null, c.due_on, 'created', c.created_at from public.review_cards c;

-- -----------------------------------------------------------------------------
-- Funções de revisão
-- -----------------------------------------------------------------------------
create function private.review_next_interval(p_repetitions integer, p_grade integer)
returns table (repetitions integer, interval_days integer)
language sql
immutable
set search_path = ''
as $$
  with ladder(l) as (select array[1, 3, 7, 14, 30, 60, 120, 240]),
  next as (
    select case p_grade
             when 1 then 0
             when 2 then greatest(p_repetitions, 0)
             when 3 then greatest(p_repetitions, 0) + 1
             when 4 then greatest(p_repetitions, 0) + 2
           end as r
  )
  select n.r, case when p_grade = 1 then 1 else (select l[least(n.r, 7) + 1] from ladder) end
    from next n;
$$;

grant execute on function private.review_next_interval(integer, integer) to authenticated, service_role;

create function public.complete_review(
  p_card_id uuid,
  p_grade integer,
  p_duration_seconds integer default null,
  p_notes text default ''
)
returns public.review_cards
language plpgsql
set search_path = ''
as $$
declare
  v_card public.review_cards;
  v_next record;
  v_attempt_id uuid;
begin
  if p_grade is null or p_grade not between 1 and 4 then
    raise exception 'Nota de revisão inválida' using errcode = '22023';
  end if;
  select * into v_card from public.review_cards where id = p_card_id for update;
  if not found then
    raise exception 'Revisão não encontrada' using errcode = 'P0002';
  end if;
  -- Idempotência: um segundo envio em menos de 60 s (clique duplo, nova tentativa de
  -- rede) não cria outra tentativa nem empurra a data duas vezes.
  if exists (
    select 1 from public.review_attempts a
     where a.review_card_id = p_card_id and a.reviewed_at > pg_catalog.now() - interval '60 seconds'
  ) then
    return v_card;
  end if;

  select * into v_next from private.review_next_interval(v_card.repetitions, p_grade);

  insert into public.review_attempts (user_id, review_card_id, grade, duration_seconds, notes)
  values (v_card.user_id, p_card_id, p_grade, p_duration_seconds, coalesce(p_notes, ''))
  returning id into v_attempt_id;

  insert into public.topic_mastery_events (user_id, topic_id, level, source, review_attempt_id)
  values (v_card.user_id, v_card.topic_id, p_grade, 'review', v_attempt_id);

  perform pg_catalog.set_config('lifeos.review_reason', 'completed', true);
  update public.review_cards
     set repetitions = v_next.repetitions,
         interval_days = v_next.interval_days,
         due_on = private.local_today() + v_next.interval_days,
         last_reviewed_at = pg_catalog.now()
   where id = p_card_id
  returning * into v_card;
  perform pg_catalog.set_config('lifeos.review_reason', '', true);
  return v_card;
end;
$$;

create function public.postpone_review(p_card_id uuid, p_days integer default 1)
returns public.review_cards
language plpgsql
set search_path = ''
as $$
declare
  v_card public.review_cards;
begin
  if p_days is null or p_days not between 1 and 60 then
    raise exception 'Adie de 1 a 60 dias' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('lifeos.review_reason', 'postponed', true);
  update public.review_cards
     set due_on = greatest(due_on, private.local_today()) + p_days
   where id = p_card_id
  returning * into v_card;
  perform pg_catalog.set_config('lifeos.review_reason', '', true);
  if v_card.id is null then
    raise exception 'Revisão não encontrada' using errcode = 'P0002';
  end if;
  return v_card;
end;
$$;

create function public.reschedule_review(p_card_id uuid, p_due_on date)
returns public.review_cards
language plpgsql
set search_path = ''
as $$
declare
  v_card public.review_cards;
begin
  if p_due_on is null or p_due_on < private.local_today() then
    raise exception 'Escolha hoje ou uma data futura' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('lifeos.review_reason', 'rescheduled', true);
  update public.review_cards set due_on = p_due_on where id = p_card_id returning * into v_card;
  perform pg_catalog.set_config('lifeos.review_reason', '', true);
  if v_card.id is null then
    raise exception 'Revisão não encontrada' using errcode = 'P0002';
  end if;
  return v_card;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reflexão pós-sessão
-- -----------------------------------------------------------------------------
create table public.session_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  session_id uuid not null
    constraint session_reflections_one_per_session unique,
  studied text not null default ''
    constraint session_reflections_studied_length check (char_length(studied) <= 2000),
  understood text not null default ''
    constraint session_reflections_understood_length check (char_length(understood) <= 2000),
  confusing text not null default ''
    constraint session_reflections_confusing_length check (char_length(confusing) <= 2000),
  questions_count integer not null default 0
    constraint session_reflections_questions_range check (questions_count between 0 and 10000),
  correct_count integer not null default 0
    constraint session_reflections_correct_non_negative check (correct_count >= 0),
  perceived_difficulty smallint
    constraint session_reflections_difficulty_range check (perceived_difficulty between 1 and 5),
  next_action text not null default ''
    constraint session_reflections_next_action_length check (char_length(next_action) <= 500),
  suggested_review_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_reflections_correct_le_questions check (correct_count <= questions_count),
  constraint session_reflections_session_fk foreign key (session_id, user_id)
    references public.focus_sessions (id, user_id) on delete cascade
);

create index session_reflections_user_idx on public.session_reflections (user_id);

select private.secure_owned_table('public.session_reflections');

-- Domínio derivado do aproveitamento em questões (regra documentada):
--   < 50 % → 1 · < 70 % → 2 · < 90 % → 3 · ≥ 90 % → 4
create function private.mastery_from_accuracy(p_questions integer, p_correct integer)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
           when p_questions is null or p_questions <= 0 then null
           when p_correct::numeric / p_questions < 0.5 then 1
           when p_correct::numeric / p_questions < 0.7 then 2
           when p_correct::numeric / p_questions < 0.9 then 3
           else 4
         end::smallint;
$$;

grant execute on function private.mastery_from_accuracy(integer, integer) to authenticated, service_role;

-- Salva (ou corrige) a reflexão de uma sessão ENCERRADA, numa transação:
--   * grava a reflexão;
--   * recalcula o registro de domínio derivado desta sessão (o antigo deixa de valer);
--   * se houver data sugerida e tópico, agenda a revisão do tópico.
create function public.save_session_reflection(
  p_session_id uuid,
  p_studied text default '',
  p_understood text default '',
  p_confusing text default '',
  p_questions_count integer default 0,
  p_correct_count integer default 0,
  p_perceived_difficulty integer default null,
  p_next_action text default '',
  p_suggested_review_on date default null
)
returns public.session_reflections
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions;
  v_reflection public.session_reflections;
  v_level smallint;
begin
  select * into v_session from public.focus_sessions where id = p_session_id;
  if not found then
    raise exception 'Sessão não encontrada' using errcode = 'P0002';
  end if;
  if v_session.status <> 'completed' then
    raise exception 'Somente sessões encerradas recebem reflexão'
      using errcode = '23514', constraint = 'session_reflections_session_completed';
  end if;

  insert into public.session_reflections (
    user_id, session_id, studied, understood, confusing, questions_count, correct_count,
    perceived_difficulty, next_action, suggested_review_on
  ) values (
    v_session.user_id, p_session_id, coalesce(p_studied, ''), coalesce(p_understood, ''),
    coalesce(p_confusing, ''), coalesce(p_questions_count, 0), coalesce(p_correct_count, 0),
    p_perceived_difficulty, coalesce(p_next_action, ''), p_suggested_review_on
  )
  on conflict (session_id) do update set
    studied = excluded.studied,
    understood = excluded.understood,
    confusing = excluded.confusing,
    questions_count = excluded.questions_count,
    correct_count = excluded.correct_count,
    perceived_difficulty = excluded.perceived_difficulty,
    next_action = excluded.next_action,
    suggested_review_on = excluded.suggested_review_on
  returning * into v_reflection;

  delete from public.topic_mastery_events where session_id = p_session_id;
  v_level := private.mastery_from_accuracy(v_reflection.questions_count, v_reflection.correct_count);
  if v_session.topic_id is not null and v_level is not null then
    insert into public.topic_mastery_events (user_id, topic_id, level, source, session_id)
    values (v_session.user_id, v_session.topic_id, v_level, 'session', p_session_id);
  end if;

  if v_session.topic_id is not null and p_suggested_review_on is not null then
    perform pg_catalog.set_config('lifeos.review_reason', 'session', true);
    insert into public.review_cards (user_id, topic_id, due_on)
    values (v_session.user_id, v_session.topic_id, p_suggested_review_on)
    on conflict on constraint review_cards_one_per_topic do update set due_on = excluded.due_on;
    perform pg_catalog.set_config('lifeos.review_reason', '', true);
  end if;

  return v_reflection;
end;
$$;

revoke all on function public.complete_review(uuid, integer, integer, text) from public, anon;
revoke all on function public.postpone_review(uuid, integer) from public, anon;
revoke all on function public.reschedule_review(uuid, date) from public, anon;
revoke all on function public.save_session_reflection(uuid, text, text, text, integer, integer, integer, text, date)
  from public, anon;
grant execute on function public.complete_review(uuid, integer, integer, text) to authenticated, service_role;
grant execute on function public.postpone_review(uuid, integer) to authenticated, service_role;
grant execute on function public.reschedule_review(uuid, date) to authenticated, service_role;
grant execute on function public.save_session_reflection(uuid, text, text, text, integer, integer, integer, text, date)
  to authenticated, service_role;
