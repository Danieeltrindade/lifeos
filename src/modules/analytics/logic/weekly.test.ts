import { describe, expect, it } from 'vitest';
import { exportTableRecords } from '@/modules/settings/data/account-repository';
import type { ActivityStats, GoalStats, StudyStats, TaskStats } from '../data/stats-api';
import { weeklySummary, weeklySummaryRows } from './weekly';

const study = {
  totals: { seconds: 7200, timerSeconds: 7200, manualSeconds: 0 },
  sessions: { count: 2, netSeconds: 7200, grossSeconds: 7800, discardedZero: 0 },
  reviews: { attempts: 3, postponed: 1 },
} as unknown as StudyStats;
const acts = {
  totals: { seconds: 10800, count: 4 },
  days: [
    { date: '2026-10-19', seconds: 3600, count: 1 },
    { date: '2026-10-20', seconds: 7200, count: 3 },
  ],
} as unknown as ActivityStats;
const tasks = {
  completed: 3,
  created: 2,
  due: { total: 4, cancelled: 0, doneOnTime: 2, doneLate: 1, open: 1, openOverdue: 1 },
} as unknown as TaskStats;
const goals = {
  goals: [
    {
      title: 'Estudar',
      unit: 'h',
      cycles: [{ start: '2026-10-19', end: '2026-10-26', value: 2, target: 5, complete: false }],
    },
    { title: 'Sem ciclo', unit: 'h', cycles: [] },
  ],
} as unknown as GoalStats;

const slot = (
  id: string,
  kind: 'event' | 'block',
  start: string,
  end: string,
  subjectId: string | null = null,
) => ({
  id,
  title: id,
  kind,
  start,
  end,
  eventId: id,
  eventKind: kind === 'event' ? 'event' : 'study',
  subjectId,
  taskId: null,
  categoryId: null,
  day: start.slice(0, 10),
});

describe('weeklySummary', () => {
  const summary = weeklySummary({
    weekStart: '2026-10-19',
    agenda: [
      slot('aula', 'event', '2026-10-19T11:00:00Z', '2026-10-19T13:00:00Z'),
      slot('estudo', 'block', '2026-10-19T12:00:00Z', '2026-10-19T14:00:00Z', 'mat'),
      slot('livre', 'block', '2026-10-20T12:00:00Z', '2026-10-20T13:00:00Z'),
    ],
    activities: [
      {
        started_at: '2026-10-19T13:00:00Z',
        ended_at: '2026-10-19T14:00:00Z',
        duration_seconds: 3600,
        subject_id: 'mat',
        task_id: null,
      },
    ],
    study,
    activityStats: acts,
    tasks,
    goals,
    habits: [{ name: 'Ler', consistency: { eligible: 5, met: 3, rate: 0.6, unit: 'days' } }],
  });

  it('planejado × realizado: só blocos vinculados entram na aderência', () => {
    expect(summary.planned).toEqual({
      commitmentsMinutes: 120,
      blocksMinutes: 180,
      linkedBlocksMinutes: 120,
      realizedInLinkedBlocksMinutes: 60,
      blockAdherence: 0.5,
    });
    expect(summary.days[0]).toEqual({
      date: '2026-10-19',
      plannedBlockMinutes: 120,
      executedMinutes: 60,
    });
  });

  it('conflitos, metas (ciclo mais recente) e hábitos', () => {
    expect(summary.conflicts).toEqual([{ day: '2026-10-19', a: 'aula', b: 'estudo', minutes: 60 }]);
    expect(summary.goals).toEqual([
      { title: 'Estudar', unit: 'h', value: 2, target: 5, finished: false, met: false },
    ]);
    expect(summary.habits[0]).toMatchObject({ met: 3, eligible: 5 });
  });

  it('linhas de exportação com unidade; aderência nula vira célula vazia', () => {
    const rows = weeklySummaryRows(summary);
    expect(rows).toContainEqual(['Aderência aos blocos', 50, '%']);
    expect(rows).toContainEqual(['Tarefas concluídas', 3, 'tarefas']);
    const none = weeklySummaryRows({
      ...summary,
      planned: { ...summary.planned, blockAdherence: null },
    });
    expect(none).toContainEqual(['Aderência aos blocos', null, '%']);
  });
});

describe('exportação CSV por tabela', () => {
  it('lê só listas de objetos da chave pedida', () => {
    expect(exportTableRecords({ tasks: [{ id: 1 }, 2] }, 'tasks')).toEqual([{ id: 1 }]);
    expect(exportTableRecords({ tasks: [] }, 'goals')).toEqual([]);
    expect(exportTableRecords(null, 'tasks')).toEqual([]);
  });
});
