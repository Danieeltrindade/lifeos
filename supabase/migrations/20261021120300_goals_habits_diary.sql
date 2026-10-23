-- =============================================================================
-- LifeOS · 011 · Fase 3 — Metas, hábitos e diário
--
-- Metas (docs/data-model.md §4.4):
--   tipos (progress_mode): manual · activity_time (horas) · study_sessions ·
--   questions · pages · tasks_completed · habit_checkins
--   periodicidade (period): once (longo prazo: de start_on até due_on) · daily ·
--   weekly (começa no dia definido no perfil) · monthly — sempre no fuso do perfil.
--   O progresso é CALCULADO a partir dos registros válidos no ciclo; só metas manuais
--   têm valor informado, por lançamentos datados (goal_progress_entries).
--   Mudanças de configuração ficam em goal_changes; como os valores são derivados,
--   editar a meta não reescreve o passado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Metas
-- -----------------------------------------------------------------------------
alter table public.goals
  add column period text not null default 'once'
    constraint goals_period_valid check (period in ('once', 'daily', 'weekly', 'monthly')),
  add column activity_kind text
    constraint goals_activity_kind_valid check (activity_kind in ('study', 'reading', 'exercise', 'project', 'work', 'leisure', 'other')),
  add column archived_at timestamptz;

alter table public.goals drop constraint goals_progress_mode_valid;
alter table public.goals add constraint goals_progress_mode_valid check (
  progress_mode in ('manual', 'activity_time', 'study_sessions', 'questions', 'pages', 'tasks_completed', 'habit_checkins')
);

-- Lançamentos de progresso das metas manuais (histórico, nunca um valor sobrescrito).
create table public.goal_progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  recorded_on date not null default private.local_today(),
  amount numeric(12, 2) not null
    constraint goal_progress_entries_amount_valid check (amount <> 0 and abs(amount) <= 1000000000),
  note text not null default ''
    constraint goal_progress_entries_note_length check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_progress_entries_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade
);

create index goal_progress_entries_goal_idx on public.goal_progress_entries (goal_id, recorded_on);
create index goal_progress_entries_user_idx on public.goal_progress_entries (user_id);

select private.secure_owned_table('public.goal_progress_entries');

-- O valor manual da Fase 2 vira um lançamento datado; a coluna deixa de existir.
insert into public.goal_progress_entries (user_id, goal_id, recorded_on, amount, note)
select g.user_id, g.id, g.start_on, g.manual_current_value, 'Valor informado antes da Fase 3'
  from public.goals g
 where g.progress_mode = 'manual' and coalesce(g.manual_current_value, 0) > 0;

alter table public.goals drop constraint goals_manual_value_only_manual;
alter table public.goals drop constraint goals_sources_match_mode;
alter table public.goals drop column manual_current_value;

alter table public.goals add constraint goals_sources_match_mode check (
  case progress_mode
    when 'manual' then num_nonnulls(subject_id, project_id, activity_category_id, habit_id, activity_kind) = 0
    when 'activity_time' then habit_id is null
      and num_nonnulls(subject_id, project_id, activity_category_id, activity_kind) <= 1
    when 'study_sessions' then num_nonnulls(project_id, activity_category_id, habit_id, activity_kind) = 0
    when 'questions' then num_nonnulls(project_id, activity_category_id, habit_id, activity_kind) = 0
    when 'pages' then num_nonnulls(subject_id, project_id, activity_category_id, habit_id, activity_kind) = 0
    when 'tasks_completed' then num_nonnulls(subject_id, activity_category_id, habit_id, activity_kind) = 0
    when 'habit_checkins' then habit_id is not null
      and num_nonnulls(subject_id, project_id, activity_category_id, activity_kind) = 0
  end
);

-- Unidade canônica das metas derivadas (o usuário só escolhe a unidade das manuais).
create function private.goals_canonical_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.unit := case new.progress_mode
    when 'activity_time' then 'h'
    when 'study_sessions' then 'sessões'
    when 'questions' then 'questões'
    when 'pages' then 'páginas'
    when 'tasks_completed' then 'tarefas'
    when 'habit_checkins' then 'vezes'
    else new.unit
  end;
  return new;
end;
$$;

create trigger goals_canonical_unit before insert or update of progress_mode, unit on public.goals
  for each row execute function private.goals_canonical_unit();

-- Histórico de configuração (somente inclusão).
create table public.goal_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  changed_at timestamptz not null default now(),
  old_target numeric(12, 2),
  new_target numeric(12, 2),
  old_period text,
  new_period text,
  old_mode text,
  new_mode text,
  old_status text,
  new_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_changes_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade
);

create index goal_changes_goal_idx on public.goal_changes (goal_id, changed_at desc);
create index goal_changes_user_idx on public.goal_changes (user_id);

select private.secure_owned_table('public.goal_changes');
revoke update on table public.goal_changes from authenticated;

create function private.goals_log_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target_value is distinct from old.target_value
     or new.period is distinct from old.period
     or new.progress_mode is distinct from old.progress_mode
     or new.status is distinct from old.status then
    insert into public.goal_changes (
      user_id, goal_id, old_target, new_target, old_period, new_period, old_mode, new_mode, old_status, new_status
    ) values (
      new.user_id, new.id, old.target_value, new.target_value, old.period, new.period,
      old.progress_mode, new.progress_mode, old.status, new.status
    );
  end if;
  return null;
end;
$$;

create trigger goals_log_changes after update on public.goals
  for each row execute function private.goals_log_changes();

-- -----------------------------------------------------------------------------
-- Cálculo de progresso
-- -----------------------------------------------------------------------------

-- Ciclo de uma meta que contém p_day: [cycle_start, cycle_end) em datas locais.
create function private.goal_cycle(
  p_period text, p_start_on date, p_due_on date, p_day date, p_week_starts_on integer
)
returns table (cycle_start date, cycle_end date)
language sql
immutable
set search_path = ''
as $$
  with raw as (
    select case p_period
             when 'daily' then p_day
             when 'weekly' then p_day - ((extract(dow from p_day)::integer - p_week_starts_on + 7) % 7)
             when 'monthly' then date_trunc('month', p_day)::date
             else p_start_on
           end as s,
           case p_period
             when 'daily' then p_day + 1
             when 'weekly' then p_day - ((extract(dow from p_day)::integer - p_week_starts_on + 7) % 7) + 7
             when 'monthly' then (date_trunc('month', p_day) + interval '1 month')::date
             else coalesce(p_due_on + 1, p_day + 1)
           end as e
  )
  -- O primeiro ciclo não começa antes do início da meta.
  select greatest(s, p_start_on), e from raw;
$$;

-- Valor de uma meta em [p_from, p_to) (datas locais no fuso p_tz).
create function private.goal_value(p_goal public.goals, p_from date, p_to date, p_tz text)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from timestamptz := (p_from::timestamp) at time zone p_tz;
  v_to timestamptz := (p_to::timestamp) at time zone p_tz;
  v numeric;
begin
  if p_to <= p_from then
    return 0;
  end if;
  case p_goal.progress_mode
    when 'manual' then
      select coalesce(sum(e.amount), 0) into v
        from public.goal_progress_entries e
       where e.goal_id = p_goal.id and e.recorded_on >= p_from and e.recorded_on < p_to;
    when 'activity_time' then
      select coalesce(sum(private.activity_seconds_in_range(a, v_from, v_to)), 0) / 3600.0 into v
        from public.activities a
       where a.started_at < v_to and a.ended_at > v_from
         and (p_goal.subject_id is null or a.subject_id = p_goal.subject_id)
         and (p_goal.activity_category_id is null or a.category_id = p_goal.activity_category_id)
         and (p_goal.activity_kind is null or a.kind = p_goal.activity_kind)
         and (p_goal.project_id is null or a.project_id = p_goal.project_id
              or a.task_id in (select t.id from public.tasks t where t.project_id = p_goal.project_id));
    when 'study_sessions' then
      select count(*) into v
        from public.focus_sessions s
       where s.status = 'completed' and s.started_at >= v_from and s.started_at < v_to
         and (p_goal.subject_id is null or s.subject_id = p_goal.subject_id)
         and private.focus_session_net_seconds(s.id) > 0;
    when 'questions' then
      select coalesce(sum(r.questions_count), 0) into v
        from public.session_reflections r
        join public.focus_sessions s on s.id = r.session_id
       where s.status = 'completed' and s.started_at >= v_from and s.started_at < v_to
         and (p_goal.subject_id is null or s.subject_id = p_goal.subject_id);
    when 'pages' then
      select coalesce(sum(a.pages), 0) into v
        from public.activities a
       where a.kind = 'reading' and a.started_at >= v_from and a.started_at < v_to;
    when 'tasks_completed' then
      select count(*) into v
        from public.tasks t
       where t.status = 'done' and t.completed_at >= v_from and t.completed_at < v_to
         and (p_goal.project_id is null or t.project_id = p_goal.project_id);
    when 'habit_checkins' then
      select count(*) into v
        from public.habit_checkins c
        join public.habits h on h.id = c.habit_id
       where c.habit_id = p_goal.habit_id and c.local_date >= p_from and c.local_date < p_to
         and (h.target_value is null or coalesce(c.value, 0) >= h.target_value);
  end case;
  return round(coalesce(v, 0), 2);
end;
$$;

grant execute on function private.goal_cycle(text, date, date, date, integer) to authenticated, service_role;
grant execute on function private.goal_value(public.goals, date, date, text) to authenticated, service_role;

-- Progresso do ciclo atual de cada meta ativa e não arquivada.
create function public.goal_progress(p_now timestamptz default now())
returns table (
  goal_id uuid,
  cycle_start date,
  cycle_end date,
  current_value numeric,
  target_value numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := private.current_user_timezone();
  v_today date := (p_now at time zone v_tz)::date;
  v_week_start integer := coalesce(
    (select p.week_starts_on from public.profiles p where p.id = (select auth.uid())), 1);
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  return query
    select g.id, c.cycle_start, c.cycle_end,
           private.goal_value(g, c.cycle_start, least(c.cycle_end, v_today + 1), v_tz),
           g.target_value
      from public.goals g
     cross join lateral private.goal_cycle(g.period, g.start_on, g.due_on, v_today, v_week_start) c
     where g.archived_at is null and g.status = 'active';
end;
$$;

-- Histórico: valor de cada um dos últimos p_cycles ciclos (metas periódicas) ou de cada
-- semana desde o início (metas de longo prazo). Calculado dos registros: editar ou excluir
-- um registro muda o histórico; editar a meta não.
create function public.goal_history(p_goal_id uuid, p_cycles integer default 8, p_now timestamptz default now())
returns table (cycle_start date, cycle_end date, value numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_goal public.goals;
  v_tz text := private.current_user_timezone();
  v_today date := (p_now at time zone v_tz)::date;
  v_week_start integer := coalesce(
    (select p.week_starts_on from public.profiles p where p.id = (select auth.uid())), 1);
  v_period text;
  v_day date;
  v_cycle record;
  i integer := 0;
begin
  select * into v_goal from public.goals where id = p_goal_id;
  if not found then
    raise exception 'Meta não encontrada' using errcode = 'P0002';
  end if;
  v_period := case when v_goal.period = 'once' then 'weekly' else v_goal.period end;
  v_day := v_today;
  while i < least(greatest(p_cycles, 1), 52) loop
    select * into v_cycle from private.goal_cycle(v_period, v_goal.start_on, null, v_day, v_week_start);
    exit when v_cycle.cycle_end <= v_goal.start_on;
    cycle_start := v_cycle.cycle_start;
    cycle_end := v_cycle.cycle_end;
    value := private.goal_value(v_goal, v_cycle.cycle_start, least(v_cycle.cycle_end, v_today + 1), v_tz);
    return next;
    exit when v_cycle.cycle_start <= v_goal.start_on;
    v_day := v_cycle.cycle_start - 1;
    i := i + 1;
  end loop;
end;
$$;

revoke all on function public.goal_progress(timestamptz) from public, anon;
revoke all on function public.goal_history(uuid, integer, timestamptz) from public, anon;
grant execute on function public.goal_progress(timestamptz) to authenticated, service_role;
grant execute on function public.goal_history(uuid, integer, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Hábitos e diário
-- -----------------------------------------------------------------------------
alter table public.habits
  add column status text not null default 'active'
    constraint habits_status_valid check (status in ('active', 'paused'));

alter table public.diary_entries
  add column title text
    constraint diary_entries_title_length check (char_length(btrim(title)) between 1 and 200);
