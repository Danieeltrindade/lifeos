/**
 * Leitura das estatísticas AGREGADAS NO BANCO (public.stats_*). O banco soma por dia local,
 * desconta pausas e respeita o RLS; aqui só validamos o formato (Zod) — se a resposta não
 * tiver o formato esperado, a tela mostra erro em vez de números errados.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useSupabase } from '@/services/supabase/supabase-context';
import { toAppError } from '@/services/supabase/errors';

const uuid = z.string();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const n = z.number();

export const studyStatsSchema = z.object({
  from: date,
  to: date,
  today: date,
  timezone: z.string(),
  days: z.array(z.object({ date, seconds: n, sessions: n })),
  bySubject: z.array(z.object({ subjectId: uuid.nullable(), seconds: n, sessions: n })),
  byTopic: z.array(z.object({ topicId: uuid, subjectId: uuid.nullable(), seconds: n })),
  totals: z.object({ seconds: n, timerSeconds: n, manualSeconds: n }),
  sessions: z.object({ count: n, netSeconds: n, grossSeconds: n, discardedZero: n }),
  questions: z.object({ questions: n, correct: n, sessionsWithQuestions: n }),
  reviews: z.object({
    attempts: n,
    byGrade: z.object({ '1': n, '2': n, '3': n, '4': n }),
    postponed: n,
    activeCards: n,
    overdueNow: n,
    dueTodayNow: n,
  }),
});
export type StudyStats = z.infer<typeof studyStatsSchema>;

export const taskStatsSchema = z.object({
  from: date,
  to: date,
  today: date,
  created: n,
  completed: n,
  cancelled: n,
  due: z.object({
    total: n,
    cancelled: n,
    doneOnTime: n,
    doneLate: n,
    open: n,
    openOverdue: n,
  }),
  openNow: n,
  overdueNow: n,
  days: z.array(z.object({ date, completed: n, created: n })),
  estimates: z.array(z.object({ taskId: uuid, estimateMinutes: n, actualSeconds: n })),
  projects: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      status: z.string(),
      dueOn: date.nullable(),
      tasksTotal: n,
      tasksDone: n,
      tasksOverdue: n,
      milestonesTotal: n,
      milestonesDone: n,
      milestonesOverdue: n,
    }),
  ),
  milestones: z.array(
    z.object({
      id: uuid,
      projectId: uuid,
      title: z.string(),
      dueOn: date,
      completedOn: date.nullable(),
    }),
  ),
});
export type TaskStats = z.infer<typeof taskStatsSchema>;

export const activityStatsSchema = z.object({
  from: date,
  to: date,
  days: z.array(z.object({ date, seconds: n, count: n })),
  byKind: z.array(z.object({ kind: z.string(), seconds: n, count: n })),
  byCategory: z.array(z.object({ categoryId: uuid.nullable(), seconds: n, count: n })),
  totals: z.object({ seconds: n, count: n }),
  reading: z.object({ count: n, pages: n, withPages: n, titles: n }),
  exercise: z.object({ count: n, distanceKm: n, withDistance: n }),
});
export type ActivityStats = z.infer<typeof activityStatsSchema>;

export const goalStatsSchema = z.object({
  from: date,
  to: date,
  today: date,
  goals: z.array(
    z.object({
      goalId: uuid,
      title: z.string(),
      period: z.string(),
      progressMode: z.string(),
      unit: z.string(),
      status: z.string(),
      archived: z.boolean(),
      startOn: date,
      dueOn: date.nullable(),
      cycles: z.array(
        z.object({
          start: date,
          end: date.nullable(),
          value: n,
          target: n,
          complete: z.boolean(),
        }),
      ),
    }),
  ),
});
export type GoalStats = z.infer<typeof goalStatsSchema>;

type StatsRpc = 'stats_study' | 'stats_tasks' | 'stats_activities' | 'stats_goals';

const SCHEMAS = {
  stats_study: studyStatsSchema,
  stats_tasks: taskStatsSchema,
  stats_activities: activityStatsSchema,
  stats_goals: goalStatsSchema,
} as const;

type StatsOf<R extends StatsRpc> = z.infer<(typeof SCHEMAS)[R]>;

/** Chave: domínio "stats" — invalidado por qualquer escrita que altere registros. */
export const statsKey = (rpc: StatsRpc, from: string, to: string) =>
  ['stats', rpc, from, to] as const;

export function useStats<R extends StatsRpc>(rpc: R, range: { from: string; to: string } | null) {
  const client = useSupabase();
  return useQuery({
    queryKey: statsKey(rpc, range?.from ?? '', range?.to ?? ''),
    enabled: range !== null,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<StatsOf<R>> => {
      if (!range) throw new Error('Período ausente');
      const { data, error } = await client
        .rpc(rpc, { p_from: range.from, p_to: range.to })
        .abortSignal(signal);
      if (error) throw toAppError(error);
      const parsed = SCHEMAS[rpc].safeParse(data);
      if (!parsed.success) {
        throw new Error('As estatísticas vieram num formato inesperado. Tente novamente.');
      }
      return parsed.data as StatsOf<R>;
    },
  });
}
