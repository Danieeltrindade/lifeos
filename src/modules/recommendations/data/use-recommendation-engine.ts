/**
 * Monta o retrato dos dados (RuleContext), avalia as regras e sincroniza com o banco.
 * Roda ao abrir o Dashboard ou a tela de Recomendações; só sincroniza quando o resultado
 * MUDA (assinatura das candidatas), então não há laço de escrita.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import {
  useCheckinsQuery,
  useGoalProgressQuery,
  useGoalsQuery,
  useHabitsQuery,
  useProjectsQuery,
  useReviewCardsQuery,
  useTasksQuery,
  useTopicsQuery,
} from '@/services/data/queries';
import { mustList } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import { useStats } from '@/modules/analytics/data/stats-api';
import { useWeeklyReviewsQuery } from '@/modules/analytics/data/weekly-review-api';
import { useCalendarRangeQuery } from '@/modules/calendar/data/calendar-api';
import { expandAgenda, minutesByDay } from '@/modules/calendar/logic/agenda';
import { toCheckins, toRule } from '@/modules/habits/data/habit-api';
import { usePreferencesQuery } from '@/modules/planning/data/planning-api';
import {
  evaluateRules,
  RULES,
  type Evaluation,
  type RuleContext,
  type RuleId,
} from '../logic/rules';
import { useSyncRecommendations } from './recommendations-api';

function useOverdueMilestonesQuery(today: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: ['projects', 'milestones', 'overdue', today],
    queryFn: ({ signal }) =>
      mustList(
        client
          .from('project_milestones')
          .select('id, title, project_id, due_on')
          .is('completed_at', null)
          .lt('due_on', today)
          .limit(200)
          .abortSignal(signal),
      ),
  });
}

export function useRecommendationEngine(options: { sync: boolean }) {
  const { today, timezone, weekStartsOn, now } = useUserCalendar();
  const windowStart = zonedToUtc(today, '00:00', timezone).toISOString();
  const windowEnd = zonedToUtc(addDays(today, 7), '00:00', timezone).toISOString();

  const tasks = useTasksQuery();
  const cards = useReviewCardsQuery();
  const topics = useTopicsQuery();
  const calendar = useCalendarRangeQuery(windowStart, windowEnd, today, addDays(today, 7));
  const prefs = usePreferencesQuery();
  const goals = useGoalsQuery();
  const progress = useGoalProgressQuery();
  const habits = useHabitsQuery();
  const checkins = useCheckinsQuery(addDays(today, -35));
  const estimates = useStats('stats_tasks', { from: addDays(today, -89), to: addDays(today, 1) });
  const milestones = useOverdueMilestonesQuery(today);
  const projects = useProjectsQuery();
  const weekly = useWeeklyReviewsQuery();

  const ready = (q: { status: string }) => q.status === 'success';
  const available = new Set<RuleId>();
  if (ready(cards) && ready(topics)) {
    available.add('review.overdue');
    available.add('review.due_soon');
  }
  if (ready(tasks)) {
    available.add('task.high_priority_due_soon');
    available.add('task.overdue');
  }
  if (ready(calendar)) available.add('calendar.conflict');
  if (ready(calendar) && ready(prefs)) available.add('day.overload');
  if (ready(goals) && ready(progress)) available.add('goal.stalled');
  if (ready(estimates)) available.add('estimate.drift');
  if (ready(habits) && ready(checkins)) available.add('habit.below_target');
  if (ready(milestones) && ready(projects)) available.add('project.milestone_overdue');
  if (ready(weekly) && ready(tasks)) available.add('week.review_due');

  const agenda = calendar.data
    ? expandAgenda(calendar.data.events, calendar.data.exceptions, windowStart, windowEnd, timezone)
    : [];
  const projectsById = new Map((projects.data ?? []).map((p) => [p.id, p]));
  const goalById = new Map((goals.data ?? []).map((g) => [g.id, g]));

  const ctx: RuleContext = {
    now,
    today,
    weekStartsOn,
    endOfDay: (d) => zonedToUtc(addDays(d, 1), '00:00', timezone).toISOString(),
    tasks: tasks.data ?? [],
    reviewCards: cards.data ?? [],
    topicNames: new Map((topics.data ?? []).map((t) => [t.id, t.name])),
    agenda,
    plannedMinutesByDay: minutesByDay(agenda, timezone),
    dailyLoadLimitMinutes: prefs.data?.dailyLoadLimitMinutes ?? 480,
    goals: (progress.data ?? []).flatMap((p) => {
      const g = goalById.get(p.goal_id);
      if (!g) return [];
      return [
        {
          id: g.id,
          title: g.title,
          period: g.period,
          status: g.status,
          archived: g.archived_at !== null,
          startOn: g.start_on,
          dueOn: g.due_on,
          unit: g.unit,
          cycleStart: p.cycle_start,
          cycleEnd: p.cycle_end,
          value: p.current_value,
          target: p.target_value,
        },
      ];
    }),
    habits: (habits.data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      status: h.status,
      archived: h.archived_at !== null,
      rule: toRule(h),
      checkins: toCheckins(checkins.data ?? [], h.id),
    })),
    estimates: estimates.data?.estimates ?? null,
    overdueMilestones: (milestones.data ?? []).flatMap((m) => {
      const p = projectsById.get(m.project_id);
      if (!p || p.archived_at !== null || p.status === 'completed' || p.status === 'cancelled')
        return [];
      return [
        {
          id: m.id,
          title: m.title,
          projectId: p.id,
          projectName: p.name,
          dueOn: m.due_on ?? today,
        },
      ];
    }),
    reviewedWeeks: new Set((weekly.data ?? []).map((w) => w.week_start)),
    hasAnyRecord:
      (tasks.data?.length ?? 0) > 0 ||
      (habits.data?.length ?? 0) > 0 ||
      (goals.data?.length ?? 0) > 0 ||
      (cards.data?.length ?? 0) > 0,
  };

  const evaluation: Evaluation = evaluateRules(ctx, available);
  const allReady = available.size === RULES.length;
  const sync = useSyncRecommendations();
  const lastSignature = useRef<string | null>(null);
  const signature = allReady
    ? JSON.stringify([
        evaluation.evaluated,
        evaluation.candidates.map((c) => [c.ruleId, c.dedupKey, c.title, c.rationale]),
      ])
    : null;

  useEffect(() => {
    if (!options.sync || signature === null || signature === lastSignature.current) return;
    lastSignature.current = signature;
    sync.mutate({ candidates: evaluation.candidates, evaluated: evaluation.evaluated });
    // `evaluation` acompanha a assinatura; sincroniza só quando ela muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.sync, signature]);

  return { evaluation, ready: allReady, syncing: sync.isPending, syncError: sync.error };
}
