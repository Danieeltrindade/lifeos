-- =============================================================================
-- LifeOS · 014 · Fase 4 — Agregações para estatísticas
--
-- As análises NÃO carregam registros brutos no navegador: estas funções agregam no banco,
-- por dia LOCAL (fuso do perfil), um intervalo de datas [p_from, p_to). As fórmulas
-- (taxas, médias, variações, comparação de períodos) ficam em TypeScript puro e testado
-- (src/modules/analytics/logic); a definição de cada indicador está em docs/metrics.md.
--
-- Regras comuns:
--   * SECURITY INVOKER: o RLS garante que só entram registros do usuário;
--   * tempo = interseção do intervalo da atividade com o dia, PAUSAS DESCONTADAS
--     (private.activity_seconds_in_range) — nunca a soma de incrementos de um cronômetro;
--   * registros excluídos não existem mais e não entram; edições valem na próxima leitura;
--   * intervalo de 1 a 731 dias.
-- =============================================================================

create function private.require_stats_range(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 731 then
    raise exception 'Intervalo inválido: de 1 a 731 dias' using errcode = '22023';
  end if;
end;
$$;

grant execute on function private.require_stats_range(date, date) to authenticated, service_role;

create function private.local_day_start(p_day date, p_tz text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_day::timestamp) at time zone p_tz;
$$;

grant execute on function private.local_day_start(date, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Estudos

-- -----------------------------------------------------------------------------
-- Índices para as agregações por período (filtros por instante do evento)
-- -----------------------------------------------------------------------------
create index tasks_user_completed_idx on public.tasks (user_id, completed_at)
  where completed_at is not null;
create index tasks_user_created_idx on public.tasks (user_id, created_at);
create index tasks_user_due_idx on public.tasks (user_id, due_on) where due_on is not null;
create index review_attempts_user_reviewed_idx on public.review_attempts (user_id, reviewed_at);
create index review_schedule_log_user_changed_idx on public.review_schedule_log (user_id, changed_at);

-- -----------------------------------------------------------------------------
create function public.stats_study(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := private.current_user_timezone();
  v_from timestamptz := private.local_day_start(p_from, v_tz);
  v_to timestamptz := private.local_day_start(p_to, v_tz);
  v_today date := private.local_today();
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  perform private.require_stats_range(p_from, p_to);

  with
  -- Tempo de estudo por atividade e dia local (uma sessão que atravessa a meia-noite
  -- divide o tempo entre os dois dias; pausas descontadas no dia em que ocorreram).
  act_days as (
    select a.id, a.subject_id, a.topic_id, a.session_id, d::date as day,
           private.activity_seconds_in_range(
             a, private.local_day_start(d::date, v_tz), private.local_day_start(d::date + 1, v_tz)) as secs
      from public.activities a
     cross join lateral generate_series(
       greatest((a.started_at at time zone v_tz)::date, p_from),
       least((a.ended_at at time zone v_tz)::date, p_to - 1),
       interval '1 day') d
     where a.kind = 'study' and a.started_at < v_to and a.ended_at > v_from
  ),
  act_pos as (select * from act_days where secs > 0),
  -- Sessões de foco (cronômetro ou registradas manualmente) INICIADAS no período.
  sess as (
    select s.id, s.subject_id, (s.started_at at time zone v_tz)::date as day,
           private.focus_session_net_seconds(s.id) as net,
           floor(extract(epoch from (s.ended_at - s.started_at)))::integer as gross
      from public.focus_sessions s
     where s.status = 'completed' and s.started_at >= v_from and s.started_at < v_to
  ),
  valid_sess as (select * from sess where net > 0),
  days as (
    select d::date as day from generate_series(p_from, p_to - 1, interval '1 day') d
  ),
  refl as (
    select r.questions_count, r.correct_count, s.subject_id
      from public.session_reflections r
      join public.focus_sessions s on s.id = r.session_id
     where s.status = 'completed' and s.started_at >= v_from and s.started_at < v_to
  ),
  attempts as (
    select a.grade from public.review_attempts a
     where a.reviewed_at >= v_from and a.reviewed_at < v_to
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'today', v_today,
    'timezone', v_tz,
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d.day,
               'seconds', coalesce((select round(sum(x.secs)) from act_pos x where x.day = d.day), 0),
               'sessions', (select count(*) from valid_sess s where s.day = d.day))
             order by d.day), '[]'::jsonb)
        from days d),
    'bySubject', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'subjectId', k.subject_id,
               'seconds', coalesce((select round(sum(x.secs)) from act_pos x where x.subject_id is not distinct from k.subject_id), 0),
               'sessions', (select count(*) from valid_sess s where s.subject_id is not distinct from k.subject_id))), '[]'::jsonb)
        from (select subject_id from act_pos union select subject_id from valid_sess) k),
    'byTopic', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'topicId', t.topic_id, 'subjectId', t.subject_id, 'seconds', t.secs)
             order by t.secs desc), '[]'::jsonb)
        from (select topic_id, min(subject_id::text)::uuid as subject_id, round(sum(secs)) as secs
                from act_pos where topic_id is not null group by topic_id) t),
    'totals', jsonb_build_object(
      'seconds', coalesce((select round(sum(secs)) from act_pos), 0),
      'timerSeconds', coalesce((select round(sum(secs)) from act_pos where session_id is not null), 0),
      'manualSeconds', coalesce((select round(sum(secs)) from act_pos where session_id is null), 0)
    ),
    'sessions', jsonb_build_object(
      'count', (select count(*) from valid_sess),
      'netSeconds', coalesce((select sum(net) from valid_sess), 0),
      'grossSeconds', coalesce((select sum(gross) from valid_sess), 0),
      'discardedZero', (select count(*) from sess where net <= 0)
    ),
    'questions', jsonb_build_object(
      'questions', coalesce((select sum(questions_count) from refl), 0),
      'correct', coalesce((select sum(correct_count) from refl), 0),
      'sessionsWithQuestions', (select count(*) from refl where questions_count > 0)
    ),
    'reviews', jsonb_build_object(
      'attempts', (select count(*) from attempts),
      'byGrade', jsonb_build_object(
        '1', (select count(*) from attempts where grade = 1),
        '2', (select count(*) from attempts where grade = 2),
        '3', (select count(*) from attempts where grade = 3),
        '4', (select count(*) from attempts where grade = 4)),
      'postponed', (select count(*) from public.review_schedule_log l
                     where l.reason = 'postponed' and l.changed_at >= v_from and l.changed_at < v_to),
      'activeCards', (select count(*) from public.review_cards c where c.status = 'active'),
      'overdueNow', (select count(*) from public.review_cards c where c.status = 'active' and c.due_on < v_today),
      'dueTodayNow', (select count(*) from public.review_cards c where c.status = 'active' and c.due_on = v_today)
    )
  ) into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tarefas e projetos
-- -----------------------------------------------------------------------------
create function public.stats_tasks(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := private.current_user_timezone();
  v_from timestamptz := private.local_day_start(p_from, v_tz);
  v_to timestamptz := private.local_day_start(p_to, v_tz);
  v_today date := private.local_today();
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  perform private.require_stats_range(p_from, p_to);

  with
  due as (
    select t.*, (t.completed_at at time zone v_tz)::date as completed_on
      from public.tasks t
     where t.due_on >= p_from and t.due_on < p_to
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to - 1, interval '1 day') d
  ),
  done_in as (
    select t.id, t.estimate_minutes, (t.completed_at at time zone v_tz)::date as day
      from public.tasks t
     where t.status = 'done' and t.completed_at >= v_from and t.completed_at < v_to
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'today', v_today,
    'created', (select count(*) from public.tasks t where t.created_at >= v_from and t.created_at < v_to),
    'completed', (select count(*) from done_in),
    'cancelled', (select count(*) from public.tasks t
                   where t.status = 'cancelled' and t.cancelled_at >= v_from and t.cancelled_at < v_to),
    'due', jsonb_build_object(
      'total', (select count(*) from due),
      'cancelled', (select count(*) from due where status = 'cancelled'),
      'doneOnTime', (select count(*) from due where status = 'done' and completed_on <= due_on),
      'doneLate', (select count(*) from due where status = 'done' and completed_on > due_on),
      'open', (select count(*) from due where status in ('todo', 'in_progress')),
      'openOverdue', (select count(*) from due where status in ('todo', 'in_progress') and due_on < v_today)
    ),
    'openNow', (select count(*) from public.tasks t where t.status in ('todo', 'in_progress')),
    'overdueNow', (select count(*) from public.tasks t
                    where t.status in ('todo', 'in_progress') and t.due_on < v_today),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d.day,
               'completed', (select count(*) from done_in x where x.day = d.day),
               'created', (select count(*) from public.tasks t
                            where (t.created_at at time zone v_tz)::date = d.day))
             order by d.day), '[]'::jsonb)
        from days d),
    -- Estimado × realizado: tarefas concluídas no período COM estimativa. O realizado é a
    -- soma de todas as atividades ligadas à tarefa (pausas já descontadas na atividade).
    'estimates', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'taskId', x.id, 'estimateMinutes', x.estimate_minutes,
               'actualSeconds', coalesce((select sum(a.duration_seconds) from public.activities a
                                           where a.task_id = x.id), 0))), '[]'::jsonb)
        from done_in x where x.estimate_minutes is not null),
    'projects', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'status', p.status, 'dueOn', p.due_on,
               'tasksTotal', (select count(*) from public.tasks t where t.project_id = p.id and t.status <> 'cancelled'),
               'tasksDone', (select count(*) from public.tasks t where t.project_id = p.id and t.status = 'done'),
               'tasksOverdue', (select count(*) from public.tasks t where t.project_id = p.id
                                 and t.status in ('todo', 'in_progress') and t.due_on < v_today),
               'milestonesTotal', (select count(*) from public.project_milestones m where m.project_id = p.id),
               'milestonesDone', (select count(*) from public.project_milestones m
                                   where m.project_id = p.id and m.completed_at is not null),
               'milestonesOverdue', (select count(*) from public.project_milestones m
                                      where m.project_id = p.id and m.completed_at is null and m.due_on < v_today))
             order by p.due_on nulls last, p.name), '[]'::jsonb)
        from public.projects p
       where p.archived_at is null and p.status in ('planned', 'active', 'on_hold')),
    'milestones', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'projectId', m.project_id, 'title', m.title, 'dueOn', m.due_on,
               'completedOn', (m.completed_at at time zone v_tz)::date)
             order by m.due_on), '[]'::jsonb)
        from public.project_milestones m
       where m.due_on >= p_from and m.due_on < p_to)
  ) into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Atividades pessoais
-- -----------------------------------------------------------------------------
create function public.stats_activities(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := private.current_user_timezone();
  v_from timestamptz := private.local_day_start(p_from, v_tz);
  v_to timestamptz := private.local_day_start(p_to, v_tz);
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  perform private.require_stats_range(p_from, p_to);

  with
  act_days as (
    select a.id, a.kind, a.category_id, d::date as day,
           private.activity_seconds_in_range(
             a, private.local_day_start(d::date, v_tz), private.local_day_start(d::date + 1, v_tz)) as secs
      from public.activities a
     cross join lateral generate_series(
       greatest((a.started_at at time zone v_tz)::date, p_from),
       least((a.ended_at at time zone v_tz)::date, p_to - 1),
       interval '1 day') d
     where a.started_at < v_to and a.ended_at > v_from
  ),
  act_pos as (select * from act_days where secs > 0),
  -- Contagem: atividades INICIADAS no período (cada uma conta uma vez).
  started as (
    select a.* , (a.started_at at time zone v_tz)::date as day
      from public.activities a
     where a.started_at >= v_from and a.started_at < v_to
  ),
  days as (
    select d::date as day from generate_series(p_from, p_to - 1, interval '1 day') d
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d.day,
               'seconds', coalesce((select round(sum(x.secs)) from act_pos x where x.day = d.day), 0),
               'count', (select count(*) from started s where s.day = d.day))
             order by d.day), '[]'::jsonb)
        from days d),
    'byKind', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'kind', k.kind,
               'seconds', coalesce((select round(sum(x.secs)) from act_pos x where x.kind = k.kind), 0),
               'count', (select count(*) from started s where s.kind = k.kind))), '[]'::jsonb)
        from (select kind from act_pos union select kind from started) k),
    'byCategory', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'categoryId', k.category_id,
               'seconds', coalesce((select round(sum(x.secs)) from act_pos x
                                     where x.category_id is not distinct from k.category_id), 0),
               'count', (select count(*) from started s where s.category_id is not distinct from k.category_id))), '[]'::jsonb)
        from (select category_id from act_pos union select category_id from started) k),
    'totals', jsonb_build_object(
      'seconds', coalesce((select round(sum(secs)) from act_pos), 0),
      'count', (select count(*) from started)
    ),
    'reading', jsonb_build_object(
      'count', (select count(*) from started where kind = 'reading'),
      'pages', coalesce((select sum(pages) from started where kind = 'reading'), 0),
      'withPages', (select count(*) from started where kind = 'reading' and pages is not null),
      'titles', (select count(distinct lower(btrim(reading_title))) from started
                  where kind = 'reading' and reading_title is not null)
    ),
    'exercise', jsonb_build_object(
      'count', (select count(*) from started where kind = 'exercise'),
      'distanceKm', coalesce((select sum(distance_km) from started where kind = 'exercise'), 0),
      'withDistance', (select count(*) from started where kind = 'exercise' and distance_km is not null)
    )
  ) into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Metas: ciclos que se sobrepõem ao período, com o ALVO EM VIGOR em cada ciclo
-- -----------------------------------------------------------------------------
create function public.stats_goals(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text := private.current_user_timezone();
  v_from timestamptz := private.local_day_start(p_from, v_tz);
  v_today date := private.local_today();
  v_week_start integer := coalesce(
    (select p.week_starts_on from public.profiles p where p.id = (select auth.uid())), 1);
  g public.goals;
  v_cycle record;
  v_anchor date;
  v_end date;
  v_eff_end date;
  v_cycles jsonb;
  v_goals jsonb := '[]'::jsonb;
  v_guard integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  perform private.require_stats_range(p_from, p_to);

  for g in
    select * from public.goals x
     where x.start_on < p_to
       and (x.archived_at is null or x.archived_at >= v_from)
     order by x.created_at
  loop
    v_cycles := '[]'::jsonb;
    if g.period = 'once' then
      v_end := case when g.due_on is null then null else g.due_on + 1 end;
      if coalesce(v_end, 'infinity'::date) > p_from and g.start_on <= v_today then
        v_eff_end := least(coalesce(v_end, v_today + 1), v_today + 1);
        v_cycles := v_cycles || jsonb_build_object(
          'start', g.start_on, 'end', v_end,
          'value', private.goal_value(g, g.start_on, v_eff_end, v_tz),
          'target', private.goal_target_at(g.id, g.target_value, private.local_day_start(v_eff_end, v_tz)),
          'complete', v_end is not null and v_end <= v_today + 1);
      end if;
    else
      v_anchor := greatest(p_from, g.start_on);
      v_guard := 0;
      while v_anchor < p_to and v_anchor <= v_today and (g.due_on is null or v_anchor <= g.due_on)
            and v_guard < 800 loop
        select * into v_cycle from private.goal_cycle(g.period, g.start_on, g.due_on, v_anchor, v_week_start);
        v_eff_end := least(v_cycle.cycle_end, v_today + 1);
        v_cycles := v_cycles || jsonb_build_object(
          'start', v_cycle.cycle_start, 'end', v_cycle.cycle_end,
          'value', private.goal_value(g, v_cycle.cycle_start, v_eff_end, v_tz),
          'target', private.goal_target_at(g.id, g.target_value, private.local_day_start(v_eff_end, v_tz)),
          'complete', v_cycle.cycle_end <= v_today + 1);
        v_anchor := v_cycle.cycle_end;
        v_guard := v_guard + 1;
      end loop;
    end if;

    v_goals := v_goals || jsonb_build_object(
      'goalId', g.id, 'title', g.title, 'period', g.period, 'progressMode', g.progress_mode,
      'unit', g.unit, 'status', g.status, 'archived', g.archived_at is not null,
      'startOn', g.start_on, 'dueOn', g.due_on, 'cycles', v_cycles);
  end loop;

  return jsonb_build_object('from', p_from, 'to', p_to, 'today', v_today, 'goals', v_goals);
end;
$$;

-- -----------------------------------------------------------------------------
-- Tempo realizado por tarefa (planejado × realizado no detalhe da tarefa)
-- -----------------------------------------------------------------------------
create function public.task_time_totals(p_task_ids uuid[])
returns table (task_id uuid, seconds bigint, activities bigint)
language sql
stable
set search_path = ''
as $$
  select a.task_id, coalesce(sum(a.duration_seconds), 0)::bigint, count(*)::bigint
    from public.activities a
   where a.task_id = any (p_task_ids)
   group by a.task_id;
$$;

-- -----------------------------------------------------------------------------
-- Exportação: inclui as tabelas da Fase 4.
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
    'version', 3,
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
    'diaryEntries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.local_date), '[]') from public.diary_entries x),
    'calendarEvents', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.calendar_events x),
    'calendarEventExceptions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.calendar_event_exceptions x),
    'recommendations', (select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at), '[]') from public.recommendations x),
    'reminders', (select coalesce(jsonb_agg(to_jsonb(x) order by x.remind_at), '[]') from public.reminders x),
    'weeklyReviews', (select coalesce(jsonb_agg(to_jsonb(x) order by x.week_start), '[]') from public.weekly_reviews x),
    'weeklyReviewPriorities', (select coalesce(jsonb_agg(to_jsonb(x) order by x.review_id, x.position), '[]') from public.weekly_review_priorities x)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------
revoke all on function public.stats_study(date, date) from public, anon;
revoke all on function public.stats_tasks(date, date) from public, anon;
revoke all on function public.stats_activities(date, date) from public, anon;
revoke all on function public.stats_goals(date, date) from public, anon;
revoke all on function public.task_time_totals(uuid[]) from public, anon;
grant execute on function public.stats_study(date, date) to authenticated, service_role;
grant execute on function public.stats_tasks(date, date) to authenticated, service_role;
grant execute on function public.stats_activities(date, date) to authenticated, service_role;
grant execute on function public.stats_goals(date, date) to authenticated, service_role;
grant execute on function public.task_time_totals(uuid[]) to authenticated, service_role;
