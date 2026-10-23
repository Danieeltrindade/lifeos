import { z } from 'zod';
import type { DashboardSummary } from '@/types/domain';

/**
 * Validação da resposta de public.dashboard_summary (jsonb). O banco é a fonte da regra,
 * mas a interface não confia cegamente no formato: se o contrato mudar sem a interface
 * acompanhar, o erro aparece aqui — e não como um "undefined" no meio da tela.
 *
 * O teste de contrato usa como fixture o JSON REAL produzido pelo Postgres
 * (__fixtures__/dashboard-summary.sql-output.json).
 */
const uuid = z.uuid();
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const minutes = z.number().int().nonnegative();

export const dashboardSummarySchema = z.object({
  origin: z.literal('user'),
  timezone: z.string().min(1),
  localDate: isoDate,
  priorityTasks: z.array(
    z.object({
      id: uuid,
      title: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
      status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
      dueOn: isoDate.nullable(),
      projectName: z.string().nullable(),
    }),
  ),
  goals: z.array(
    z.object({
      id: uuid,
      title: z.string(),
      current: z.number().nonnegative(),
      target: z.number().positive(),
      unit: z.string(),
      dueOn: isoDate.nullable(),
      progressMode: z.enum([
        'manual',
        'activity_time',
        'study_sessions',
        'questions',
        'pages',
        'tasks_completed',
        'habit_checkins',
      ]),
      period: z.enum(['once', 'daily', 'weekly', 'monthly']),
      cycleStart: isoDate,
      cycleEnd: isoDate,
    }),
  ),
  studies: z.object({
    actualMinutesToday: minutes,
    actualMinutesLast7Days: minutes,
    sessionsToday: minutes,
    topSubjectsLast7Days: z.array(
      z.object({ subjectId: uuid, subjectName: z.string(), actualMinutes: minutes }),
    ),
  }),
  reviews: z.array(
    z.object({
      id: uuid,
      topicName: z.string(),
      subjectName: z.string(),
      dueOn: isoDate,
      priority: z.enum(['high', 'medium', 'low']),
    }),
  ),
  reviewCounts: z.object({ overdue: minutes, dueToday: minutes }),
  recentActivities: z.array(
    z.object({
      id: uuid,
      title: z.string(),
      category: z.string().nullable(),
      kind: z.string(),
      startedAt: isoDateTime,
      durationMinutes: minutes,
      source: z.enum(['timer', 'manual']),
    }),
  ),
  activeProjects: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      dueOn: isoDate.nullable(),
      priority: z.enum(['high', 'medium', 'low']),
      tasksTotal: minutes,
      tasksDone: minutes,
    }),
  ),
  recommendations: z.array(z.object({ id: uuid, title: z.string(), rationale: z.string().min(1) })),
  setup: z.object({
    subjects: minutes,
    tasks: minutes,
    habits: minutes,
    goals: minutes,
    activities: minutes,
    events: minutes,
  }),
});

export function parseDashboardSummary(json: unknown): DashboardSummary {
  return dashboardSummarySchema.parse(json);
}
