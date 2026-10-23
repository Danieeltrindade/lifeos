-- =============================================================================
-- LifeOS · 007 · Funções da API (RPC)
--
-- Todas são SECURITY INVOKER (o RLS do chamador se aplica), exceto
-- delete_my_account, que precisa remover a linha em auth.users e valida auth.uid().
-- Nenhuma é executável por anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilitários de tempo
-- -----------------------------------------------------------------------------

-- Segundos de sobreposição entre [a_start, a_end) e [b_start, b_end).
create function private.overlap_seconds(
  a_start timestamptz, a_end timestamptz, b_start timestamptz, b_end timestamptz
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(0, extract(epoch from (least(a_end, b_end) - greatest(a_start, b_start))));
$$;

-- Tempo LÍQUIDO de uma atividade dentro de um intervalo. Para atividades de
-- cronômetro, descontam-se só as pausas que caem no intervalo: uma sessão que
-- atravessa a meia-noite é dividida exatamente entre os dois dias.
create function private.activity_seconds_in_range(
  p_activity public.activities, p_from timestamptz, p_to timestamptz
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select greatest(
    0,
    private.overlap_seconds(p_activity.started_at, p_activity.ended_at, p_from, p_to)
    - coalesce((
        select sum(private.overlap_seconds(
                 p.started_at, p.ended_at,
                 greatest(p_from, p_activity.started_at), least(p_to, p_activity.ended_at)))
          from public.session_pauses p
         where p_activity.session_id is not null
           and p.session_id = p_activity.session_id
           and p.ended_at is not null
      ), 0)
  );
$$;

grant execute on function private.overlap_seconds(timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated, service_role;
grant execute on function private.activity_seconds_in_range(public.activities, timestamptz, timestamptz)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Sessão de foco (cronômetro). Instantes vêm do relógio do servidor (RN-07).
-- -----------------------------------------------------------------------------
create function public.start_focus_session(
  p_subject_id uuid default null,
  p_topic_id uuid default null,
  p_task_id uuid default null,
  p_planned_seconds integer default null
)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions;
begin
  insert into public.focus_sessions (subject_id, topic_id, task_id, planned_seconds, started_at)
  values (p_subject_id, p_topic_id, p_task_id, p_planned_seconds, pg_catalog.now())
  returning * into v_session;
  return v_session;
exception
  when unique_violation then
    raise exception 'Já existe uma sessão de foco ativa'
      using errcode = '23505', constraint = 'focus_sessions_one_active_per_user';
end;
$$;

create function private.require_active_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions;
begin
  select * into v_session from public.focus_sessions where id = p_session_id for update;
  if not found then
    -- Inexistente ou de outra conta (o RLS esconde): mesma resposta, sem vazar existência.
    raise exception 'Sessão não encontrada' using errcode = 'P0002';
  end if;
  if v_session.status <> 'active' then
    raise exception 'A sessão já foi encerrada' using errcode = '23514', constraint = 'focus_sessions_must_be_active';
  end if;
  return v_session;
end;
$$;

grant execute on function private.require_active_session(uuid) to authenticated, service_role;

create function public.pause_focus_session(p_session_id uuid)
returns public.session_pauses
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions := private.require_active_session(p_session_id);
  v_pause public.session_pauses;
begin
  insert into public.session_pauses (session_id, started_at)
  values (v_session.id, pg_catalog.now())
  returning * into v_pause;
  return v_pause;
exception
  when unique_violation or exclusion_violation then
    raise exception 'A sessão já está pausada'
      using errcode = '23505', constraint = 'session_pauses_one_open_per_session';
end;
$$;

create function public.resume_focus_session(p_session_id uuid)
returns public.session_pauses
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions := private.require_active_session(p_session_id);
  v_pause public.session_pauses;
begin
  update public.session_pauses
     set ended_at = pg_catalog.now()
   where session_id = v_session.id and ended_at is null
  returning * into v_pause;
  if not found then
    raise exception 'A sessão não está pausada' using errcode = '23514', constraint = 'session_pauses_must_be_open';
  end if;
  return v_pause;
end;
$$;

-- Encerra a sessão. Uma pausa aberta é fechada no MESMO instante (RN-05) e a
-- atividade correspondente é criada pelo banco na mesma transação (RN-03/RN-04).
create function public.complete_focus_session(p_session_id uuid)
returns public.activities
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions := private.require_active_session(p_session_id);
  v_now timestamptz := pg_catalog.now();
  v_activity public.activities;
begin
  update public.session_pauses set ended_at = v_now where session_id = v_session.id and ended_at is null;
  update public.focus_sessions set status = 'completed', ended_at = v_now where id = v_session.id;
  select * into v_activity from public.activities where session_id = v_session.id;
  return v_activity;
end;
$$;

create function public.discard_focus_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_session public.focus_sessions := private.require_active_session(p_session_id);
  v_now timestamptz := pg_catalog.now();
begin
  update public.session_pauses set ended_at = v_now where session_id = v_session.id and ended_at is null;
  update public.focus_sessions set status = 'discarded', ended_at = v_now where id = v_session.id
  returning * into v_session;
  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resumo do dashboard. Retorna exatamente o contrato DashboardSummary da interface
-- (src/types/domain.ts), com chaves em camelCase. O "dia" é o do fuso do perfil.
-- Limitação desta fase: eventos recorrentes ainda não são expandidos (Fase 4).
-- -----------------------------------------------------------------------------
create function public.dashboard_summary(p_now timestamptz default now())
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
  agenda as (
    select e.id, e.title, e.kind, e.all_day,
           case when e.all_day then v_day_start else e.starts_at end as planned_start,
           case when e.all_day then v_day_end else e.ends_at end as planned_end
      from public.calendar_events e
     where e.recurrence_rule is null
       and (
         (not e.all_day and e.starts_at < v_day_end and e.ends_at > v_day_start)
         or (e.all_day and e.start_date <= v_today and e.end_date > v_today)
       )
  ),
  open_tasks as (
    select t.id, t.title, t.priority, t.status, t.due_on, p.name as project_name
      from public.tasks t
      left join public.projects p on p.id = t.project_id
     where t.status in ('todo', 'in_progress')
     order by case t.priority when 'high' then 0 when 'medium' then 1 else 2 end,
              t.due_on nulls last, t.created_at
     limit 5
  ),
  goal_rows as (
    select g.id, g.title, g.unit, g.target_value, g.due_on, g.progress_mode,
           case g.progress_mode
             when 'manual' then coalesce(g.manual_current_value, 0)
             when 'activity_time' then round((
               select coalesce(sum(a.duration_seconds), 0)
                 from public.activities a
                where a.started_at >= (g.start_on::timestamp at time zone v_tz)
                  and (g.due_on is null or a.started_at < ((g.due_on + 1)::timestamp at time zone v_tz))
                  and (g.subject_id is null or a.subject_id = g.subject_id)
                  and (g.project_id is null or a.project_id = g.project_id
                       or a.task_id in (select t.id from public.tasks t where t.project_id = g.project_id))
                  and (g.activity_category_id is null or a.category_id = g.activity_category_id)
             ) / 3600.0, 1)
             when 'habit_checkins' then (
               select count(*)
                 from public.habit_checkins c
                where c.habit_id = g.habit_id
                  and c.local_date >= g.start_on
                  and (g.due_on is null or c.local_date <= g.due_on)
             )
           end as current_value
      from public.goals g
     where g.status = 'active'
     order by g.due_on nulls last, g.created_at
     limit 5
  ),
  study_acts as (
    select a.*, private.activity_seconds_in_range(a, v_day_start, v_day_end) as secs_today,
           private.activity_seconds_in_range(a, v_week_start, v_day_end) as secs_week
      from public.activities a
     where a.subject_id is not null
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
    select r.id, r.due_on, t.name as topic_name, s.name as subject_name
      from public.review_cards r
      join public.topics t on t.id = r.topic_id
      join public.subjects s on s.id = t.subject_id
     where r.status = 'active' and r.due_on <= v_today + 7
     order by r.due_on, t.name
     limit 5
  ),
  recent as (
    select a.id, a.title, a.started_at, a.duration_seconds, a.source, c.name as category_name
      from public.activities a
      left join public.activity_categories c on c.id = a.category_id
     order by a.ended_at desc
     limit 5
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
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'title', a.title, 'kind', a.kind, 'allDay', a.all_day,
               'plannedStart', a.planned_start, 'plannedEnd', a.planned_end)
             order by a.all_day desc, a.planned_start)
        from agenda a), '[]'::jsonb),
    'priorityTasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'title', t.title, 'priority', t.priority, 'status', t.status,
               'dueOn', t.due_on, 'projectName', t.project_name)
             order by case t.priority when 'high' then 0 when 'medium' then 1 else 2 end, t.due_on nulls last)
        from open_tasks t), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'title', g.title, 'current', g.current_value, 'target', g.target_value,
               'unit', g.unit, 'dueOn', g.due_on, 'progressMode', g.progress_mode)
             order by g.due_on nulls last)
        from goal_rows g), '[]'::jsonb),
    'studies', jsonb_build_object(
      'plannedMinutesToday', coalesce((
        select round(sum(private.overlap_seconds(e.starts_at, e.ends_at, v_day_start, v_day_end)) / 60.0)::integer
          from public.calendar_events e
         where e.kind = 'study' and not e.all_day and e.recurrence_rule is null
           and e.starts_at < v_day_end and e.ends_at > v_day_start), 0),
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
               'id', r.id, 'topicName', r.topic_name, 'subjectName', r.subject_name, 'dueOn', r.due_on)
             order by r.due_on, r.topic_name)
        from due_reviews r), '[]'::jsonb),
    'recentActivities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'title', a.title, 'category', a.category_name, 'startedAt', a.started_at,
               'durationMinutes', round(a.duration_seconds / 60.0)::integer, 'source', a.source)
             order by a.started_at desc)
        from recent a), '[]'::jsonb),
    'recommendations', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'rationale', r.rationale))
        from recs r), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Exportação dos dados pessoais (portabilidade — LGPD art. 18, V).
-- SECURITY INVOKER: o RLS garante que só os dados do chamador entram.
-- -----------------------------------------------------------------------------
create function public.export_my_data()
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
    'version', 1,
    'exportedAt', pg_catalog.now(),
    'account', jsonb_build_object('id', v_uid, 'email', (select auth.jwt()) ->> 'email'),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'projects', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.projects x),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.tasks x),
    'taskDependencies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.task_dependencies x),
    'subjects', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.subjects x),
    'topics', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.topics x),
    'learningNotes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.learning_notes x),
    'focusSessions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]') from public.focus_sessions x),
    'sessionPauses', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]') from public.session_pauses x),
    'reviewCards', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.review_cards x),
    'reviewAttempts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.reviewed_at), '[]') from public.review_attempts x),
    'activityCategories', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.activity_categories x),
    'activities', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]') from public.activities x),
    'habits', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.habits x),
    'habitCheckins', (select coalesce(jsonb_agg(to_jsonb(x) order by x.local_date), '[]') from public.habit_checkins x),
    'goals', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.goals x),
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
-- Exclusão da própria conta. SECURITY DEFINER é inevitável: a linha vive em
-- auth.users, fora do alcance do papel authenticated. A função:
--   * só age sobre auth.uid() (nunca recebe um ID como parâmetro);
--   * tem search_path vazio e não é executável por anon;
--   * apaga auth.users → profiles → todos os dados (ON DELETE CASCADE).
-- A interface exige reautenticação com senha antes de chamá-la.
-- -----------------------------------------------------------------------------
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios das funções: somente authenticated (e service_role).
-- -----------------------------------------------------------------------------
revoke all on function public.start_focus_session(uuid, uuid, uuid, integer) from public, anon;
revoke all on function public.pause_focus_session(uuid) from public, anon;
revoke all on function public.resume_focus_session(uuid) from public, anon;
revoke all on function public.complete_focus_session(uuid) from public, anon;
revoke all on function public.discard_focus_session(uuid) from public, anon;
revoke all on function public.dashboard_summary(timestamptz) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;

grant execute on function public.start_focus_session(uuid, uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.pause_focus_session(uuid) to authenticated, service_role;
grant execute on function public.resume_focus_session(uuid) to authenticated, service_role;
grant execute on function public.complete_focus_session(uuid) to authenticated, service_role;
grant execute on function public.discard_focus_session(uuid) to authenticated, service_role;
grant execute on function public.dashboard_summary(timestamptz) to authenticated, service_role;
grant execute on function public.export_my_data() to authenticated, service_role;
grant execute on function public.delete_my_account() to authenticated;
