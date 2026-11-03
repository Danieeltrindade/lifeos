import { useWeekWindow } from '@/hooks/useWeekWindow';
import { addDays, type ISODate } from '@/lib/date';
import { startOfWeek } from '@/lib/zoned';
import { useGoalProgressQuery, useGoalsQuery, useSubjectsQuery } from '@/services/data/queries';
import { useDataSource } from '@/services/data-source/data-source-context';
import { useStats } from '@/modules/analytics/data/stats-api';
import { useStudyTimeQuery } from '@/modules/studies/data/studies-api';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; value: T };

export interface WeekDay {
  date: ISODate;
  minutes: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface DashboardInsights {
  /** Tarefas abertas e atrasadas agora + concluídas nesta semana (stats_tasks). */
  tasks: Loadable<{ open: number; overdue: number; completedThisWeek: number }>;
  /** Metas ativas e quantas já atingiram o alvo no ciclo atual (goal_progress). */
  goals: Loadable<{ active: number; reached: number }>;
  /** Minutos estudados por dia na semana atual (stats_study). */
  week: Loadable<{ days: WeekDay[]; totalMinutes: number }>;
  /** Estudo da semana nas matérias com carga semanal definida (mesma conta da tela Estudos). */
  weeklyTarget: Loadable<{ doneMinutes: number; targetMinutes: number } | null>;
}

function loadable<T>(
  real: boolean,
  status: 'pending' | 'error' | 'success',
  build: () => T,
): Loadable<T> {
  if (!real) return { status: 'unavailable' };
  if (status === 'pending') return { status: 'loading' };
  if (status === 'error') return { status: 'error' };
  return { status: 'ready', value: build() };
}

/**
 * Indicadores do dashboard, todos calculados a partir das MESMAS consultas e RPCs das telas
 * de origem (Tarefas, Metas, Estudos e Análises). Nada é estimado: sem dados reais, o
 * indicador fica indisponível em vez de mostrar um número.
 */
export function useDashboardInsights(today: ISODate, weekStartsOn: number): DashboardInsights {
  const { mode } = useDataSource();
  const real = mode === 'supabase';
  const weekStart = startOfWeek(today, weekStartsOn);
  const range = real ? { from: weekStart, to: addDays(weekStart, 7) } : null;
  const studyStats = useStats('stats_study', range);
  const taskStats = useStats('stats_tasks', range);
  const goalsQuery = useGoalsQuery();
  const progressQuery = useGoalProgressQuery();
  const subjectsQuery = useSubjectsQuery();
  const window = useWeekWindow();
  const timeQuery = useStudyTimeQuery(window.from, window.to);

  const tasks = loadable(real, taskStats.status, () => {
    const s = taskStats.data;
    return {
      open: s?.openNow ?? 0,
      overdue: s?.overdueNow ?? 0,
      completedThisWeek: s?.completed ?? 0,
    };
  });

  const goalsStatus =
    goalsQuery.status === 'error' || progressQuery.status === 'error'
      ? 'error'
      : goalsQuery.status === 'pending' || progressQuery.status === 'pending'
        ? 'pending'
        : 'success';
  const goals = loadable(real, goalsStatus, () => {
    const active = (goalsQuery.data ?? []).filter(
      (g) => g.archived_at === null && g.status === 'active',
    );
    const progress = new Map((progressQuery.data ?? []).map((p) => [p.goal_id, p]));
    const reached = active.filter((g) => {
      const p = progress.get(g.id);
      return p !== undefined && p.target_value > 0 && p.current_value >= p.target_value;
    }).length;
    return { active: active.length, reached };
  });

  const week = loadable(real, studyStats.status, () => {
    const byDate = new Map((studyStats.data?.days ?? []).map((d) => [d.date, d.seconds]));
    const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return {
        date,
        minutes: Math.round((byDate.get(date) ?? 0) / 60),
        isToday: date === today,
        isFuture: date > today,
      };
    });
    return { days, totalMinutes: days.reduce((sum, d) => sum + d.minutes, 0) };
  });

  const targetStatus =
    subjectsQuery.status === 'error' || timeQuery.status === 'error'
      ? 'error'
      : subjectsQuery.status === 'pending' || timeQuery.status === 'pending'
        ? 'pending'
        : 'success';
  const weeklyTarget = loadable(real, targetStatus, () => {
    const withTarget = (subjectsQuery.data ?? []).filter(
      (s) =>
        s.archived_at === null &&
        s.status === 'active' &&
        s.target_minutes_per_week !== null &&
        s.target_minutes_per_week > 0,
    );
    if (withTarget.length === 0) return null;
    const seconds = new Map((timeQuery.data ?? []).map((t) => [t.subject_id, t.seconds]));
    return {
      targetMinutes: withTarget.reduce((sum, s) => sum + (s.target_minutes_per_week ?? 0), 0),
      doneMinutes: Math.round(
        withTarget.reduce((sum, s) => sum + (seconds.get(s.id) ?? 0), 0) / 60,
      ),
    };
  });

  return { tasks, goals, week, weeklyTarget };
}
