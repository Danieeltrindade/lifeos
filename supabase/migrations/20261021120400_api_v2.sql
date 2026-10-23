-- =============================================================================
-- LifeOS · 012 · Fase 3 — Resumo do dashboard v2 e exportação
--
-- Mudanças no contrato de dashboard_summary:
--   * agenda e minutos planejados SAEM do servidor: a interface usa a mesma expansão de
--     recorrências do calendário (uma única regra para eventos recorrentes);
--   * metas vêm de goal_progress (ciclo atual, todos os tipos);
--   * entram projetos ativos (com contagem de tarefas), contadores de revisões e um
--     bloco "setup" que permite adaptar a tela de quem está começando.
-- =============================================================================

create or replace function public.dashboard_summary(p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tz text := private.current_user_timezone();
  v_today date := (p_now at time zone v_tz)::date;
  v_day_start timestamptz := (v_today::timestamp) at time zone v_tz;
  v_day_end timestamptz := ((v_today + 1)::timestamp) at time zone v_tz;
  v_week_start timestamptz := ((v_today - 6)::timestamp) at time zone v_tz;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;

  with
  open_tasks as (
    select t.id, t.title, t.priority, t.status, t.due_on, p.name as project_name
      from public.tasks t
      left join public.projects p on p.id = t.project_id
     where t.status in ('todo', 'in_progress')
     order by case when t.due_on < v_today then 0 else 1 end,
              case t.priority when 'high' then 0 when 'medium' then 1 else 2 end,
              t.due_on nulls last, t.created_at
     limit 6
  ),
  goal_rows as (
    select g.id, g.title, g.unit, g.due_on, g.progress_mode, g.period,
           gp.current_value, gp.target_value, gp.cycle_start, gp.cycle_end
      from public.goal_progress(p_now) gp
      join public.goals g on g.id = gp.goal_id
     order by g.due_on nulls last, g.created_at
     limit 4
  ),
  study_acts as (
    select a.*, private.activity_seconds_in_range(a, v_day_start, v_day_end) as secs_today,
           private.activity_seconds_in_range(a, v_week_start, v_day_end) as secs_week
      from public.activities a
     where a.kind = 'study'
       and a.started_at < v_day_end
       and a.ended_at > v_week_start
  ),
  top_subjects as (
    select s.id, s.name, round(sum(sa.secs_week) / 60.0)::integer as minutes
      from study_acts sa
      join public.subjects s on s.id = sa.subject_id
     group by s.id, s.name
    having sum(sa.secs_week) > 0
     order by minutes desc, s.name
     limit 3
  ),
  due_reviews as (
    select r.id, r.due_on, r.priority, t.name as topic_name, s.name as subject_name
      from public.review_cards r
      join public.topics t on t.id = r.topic_id
      join public.subjects s on s.id = t.subject_id
     where r.status = 'active' and r.due_on <= v_today + 7
     order by r.due_on, case r.priority when 'high' then 0 when 'medium' then 1 else 2 end, t.name
     limit 6
  ),
  recent as (
    select a.id, a.title, a.kind, a.started_at, a.ended_at, a.duration_seconds, a.source,
           c.name as category_name
      from public.activities a
      left join public.activity_categories c on c.id = a.category_id
     order by a.ended_at desc
     limit 5
  ),
  projects_active as (
    select p.id, p.name, p.due_on, p.priority,
           (select count(*) from public.tasks t where t.project_id = p.id and t.status <> 'cancelled') as total,
           (select count(*) from public.tasks t where t.project_id = p.id and t.status = 'done') as done
      from public.projects p
     where p.status = 'active' and p.archived_at is null
     order by p.due_on nulls last, p.created_at
     limit 4
  ),
  recs as (
    select r.id, r.title, r.rationale
      from public.recommendations r
     where r.status = 'pending' and (r.expires_at is null or r.expires_at > p_now)
     order by r.generated_at desc
     limit 3
  )
  select jsonb_build_object(
    'origin', 'user',
    'timezone', v_tz,
    'localDate', v_today,
    'priorityTasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'title', t.title, 'priority', t.priority, 'status', t.status,
               'dueOn', t.due_on, 'projectName', t.project_name)
             order by case when t.due_on < v_today then 0 else 1 end,
                      case t.priority when 'high' then 0 when 'medium' then 1 else 2 end, t.due_on nulls last)
        from open_tasks t), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'title', g.title, 'current', g.current_value, 'target', g.target_value,
               'unit', g.unit, 'dueOn', g.due_on, 'progressMode', g.progress_mode, 'period', g.period,
               'cycleStart', g.cycle_start, 'cycleEnd', g.cycle_end)
             order by g.due_on nulls last)
        from goal_rows g), '[]'::jsonb),
    'studies', jsonb_build_object(
      'actualMinutesToday', coalesce((select round(sum(secs_today) / 60.0)::integer from study_acts), 0),
      'actualMinutesLast7Days', coalesce((select round(sum(secs_week) / 60.0)::integer from study_acts), 0),
      'sessionsToday', (select count(*) from study_acts where secs_today > 0),
      'topSubjectsLast7Days', coalesce((
        select jsonb_agg(jsonb_build_object('subjectId', ts.id, 'subjectName', ts.name, 'actualMinutes', ts.minutes)
                         order by ts.minutes desc, ts.name)
          from top_subjects ts), '[]'::jsonb)
    ),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'topicName', r.topic_name, 'subjectName', r.subject_name, 'dueOn', r.due_on,
               'priority', r.priority)
             order by r.due_on, r.topic_name)
        from due_reviews r), '[]'::jsonb),
    'reviewCounts', jsonb_build_object(
      'overdue', (select count(*) from public.review_cards r where r.status = 'active' and r.due_on < v_today),
      'dueToday', (select count(*) from public.review_cards r where r.status = 'active' and r.due_on = v_today)
    ),
    'recentActivities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'title', a.title, 'category', a.category_name, 'kind', a.kind,
               'startedAt', a.started_at, 'durationMinutes', round(a.duration_seconds / 60.0)::integer,
               'source', a.source)
             order by a.ended_at desc)
        from recent a), '[]'::jsonb),
    'activeProjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'dueOn', p.due_on, 'priority', p.priority,
               'tasksTotal', p.total, 'tasksDone', p.done)
             order by p.due_on nulls last)
        from projects_active p), '[]'::jsonb),
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'rationale', r.rationale))
        from recs r), '[]'::jsonb),
    'setup', jsonb_build_object(
      'subjects', (select count(*) from public.subjects),
      'tasks', (select count(*) from public.tasks),
      'habits', (select count(*) from public.habits),
      'goals', (select count(*) from public.goals),
      'activities', (select count(*) from public.activities),
      'events', (select count(*) from public.calendar_events)
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Exportação: inclui as tabelas novas.
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
    'version', 2,
    'exportedAt', pg_catalog.now(),
    'account', jsonb_build_object('id', v_uid, 'email', (select auth.jwt()) ->> 'email'),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
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
    'diaryEntries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.local_date), '[]') from public.diary_entries x),
    'calendarEvents', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.calendar_events x),
    'calendarEventExceptions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.calendar_event_exceptions x),
    'recommendations', (select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at), '[]') from public.recommendations x),
    'reminders', (select coalesce(jsonb_agg(to_jsonb(x) order by x.remind_at), '[]') from public.reminders x)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Cronômetro (Fase 3)
-- -----------------------------------------------------------------------------

-- Início com técnica de estudo. Substitui a versão da Fase 2 (mesmos parâmetros + técnica).
drop function public.start_focus_session(uuid, uuid, uuid, integer);
create function public.start_focus_session(
  p_subject_id uuid default null,
  p_topic_id uuid default null,
  p_task_id uuid default null,
  p_planned_seconds integer default null,
  p_technique text default 'free'
)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions;
begin
  insert into public.focus_sessions (subject_id, topic_id, task_id, planned_seconds, technique, started_at)
  values (p_subject_id, p_topic_id, p_task_id, p_planned_seconds, coalesce(p_technique, 'free'), pg_catalog.now())
  returning * into v_session;
  return v_session;
exception
  when unique_violation then
    raise exception 'Já existe uma sessão de foco ativa'
      using errcode = '23505', constraint = 'focus_sessions_one_active_per_user';
end;
$$;

-- Sessão interrompida (aba fechada, cronômetro esquecido): encerra num instante
-- ESCOLHIDO pelo usuário, entre o início e agora. Pausas depois desse instante são
-- descartadas e a pausa que o atravessa é fechada nele.
create function public.complete_focus_session_at(p_session_id uuid, p_ended_at timestamptz)
returns public.activities
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions := private.require_active_session(p_session_id);
  v_activity public.activities;
begin
  if p_ended_at is null or p_ended_at <= v_session.started_at or p_ended_at > pg_catalog.now() then
    raise exception 'O fim precisa estar entre o início da sessão e agora'
      using errcode = '22023';
  end if;
  delete from public.session_pauses where session_id = v_session.id and started_at >= p_ended_at;
  update public.session_pauses set ended_at = p_ended_at
   where session_id = v_session.id and (ended_at is null or ended_at > p_ended_at);
  update public.focus_sessions set status = 'completed', ended_at = p_ended_at where id = v_session.id;
  select * into v_activity from public.activities where session_id = v_session.id;
  return v_activity;
end;
$$;

-- Correção dos horários de uma sessão ENCERRADA. As pausas são ajustadas à nova janela
-- (as que ficam totalmente fora são removidas), então o tempo líquido nunca fica negativo;
-- a atividade correspondente é recalculada pelos gatilhos.
create function public.correct_focus_session(p_session_id uuid, p_started_at timestamptz, p_ended_at timestamptz)
returns public.activities
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions;
  v_activity public.activities;
begin
  select * into v_session from public.focus_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Sessão não encontrada' using errcode = 'P0002';
  end if;
  if v_session.status <> 'completed' then
    raise exception 'Só sessões encerradas podem ser corrigidas'
      using errcode = '23514', constraint = 'focus_sessions_correct_completed';
  end if;
  if p_started_at is null or p_ended_at is null or p_ended_at <= p_started_at then
    raise exception 'O fim precisa ser depois do início' using errcode = '22023';
  end if;
  delete from public.session_pauses
   where session_id = p_session_id and (started_at >= p_ended_at or ended_at <= p_started_at);
  update public.session_pauses
     set started_at = greatest(started_at, p_started_at), ended_at = least(ended_at, p_ended_at)
   where session_id = p_session_id and (started_at < p_started_at or ended_at > p_ended_at);
  update public.focus_sessions set started_at = p_started_at, ended_at = p_ended_at where id = p_session_id;
  select * into v_activity from public.activities where session_id = p_session_id;
  return v_activity;
end;
$$;

revoke all on function public.correct_focus_session(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.correct_focus_session(uuid, timestamptz, timestamptz) to authenticated, service_role;
revoke all on function public.start_focus_session(uuid, uuid, uuid, integer, text) from public, anon;
revoke all on function public.complete_focus_session_at(uuid, timestamptz) from public, anon;
grant execute on function public.start_focus_session(uuid, uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.complete_focus_session_at(uuid, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tempo de estudo por matéria numa janela (mesma regra do dashboard: interseção com a
-- janela, pausas descontadas). Matéria nula = estudo sem matéria.
-- -----------------------------------------------------------------------------
create function public.study_time_by_subject(p_from timestamptz, p_to timestamptz)
returns table (subject_id uuid, seconds integer)
language sql
stable
set search_path = ''
as $$
  select a.subject_id, round(sum(private.activity_seconds_in_range(a, p_from, p_to)))::integer
    from public.activities a
   where a.kind = 'study' and a.started_at < p_to and a.ended_at > p_from
   group by a.subject_id;
$$;

revoke all on function public.study_time_by_subject(timestamptz, timestamptz) from public, anon;
grant execute on function public.study_time_by_subject(timestamptz, timestamptz) to authenticated, service_role;
