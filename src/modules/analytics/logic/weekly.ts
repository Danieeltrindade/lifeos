/**
 * Resumo da revisão semanal (docs/metrics.md §7) — puro e exportável.
 * Sem nota "boa/ruim": só fatos lado a lado (planejado, realizado, prazos, metas, hábitos).
 */
import { addDays, type ISODate } from '@/lib/date';
import { actualSecondsInBlock } from '@/modules/calendar/logic/calendar-items';
import type { AgendaSlot } from '@/modules/calendar/logic/agenda';
import { findConflicts } from '@/modules/calendar/logic/conflicts';
import type { ActivityStats, GoalStats, StudyStats, TaskStats } from '../data/stats-api';
import type { RangeConsistency } from './habit-stats';
import { safeRate } from './metrics';

export interface WeeklyInputs {
  weekStart: ISODate;
  agenda: readonly AgendaSlot[];
  activities: readonly {
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    subject_id: string | null;
    task_id: string | null;
  }[];
  study: StudyStats;
  activityStats: ActivityStats;
  tasks: TaskStats;
  goals: GoalStats;
  habits: readonly { name: string; consistency: RangeConsistency }[];
}

export interface WeeklySummary {
  weekStart: ISODate;
  weekEnd: ISODate;
  planned: {
    commitmentsMinutes: number;
    blocksMinutes: number;
    /** Blocos ligados a matéria/tarefa — os únicos comparáveis com o realizado. */
    linkedBlocksMinutes: number;
    realizedInLinkedBlocksMinutes: number;
    /** Realizado dentro dos blocos vinculados ÷ planejado neles; null sem blocos. */
    blockAdherence: number | null;
  };
  executed: { activityMinutes: number; studyMinutes: number; activities: number };
  days: { date: ISODate; plannedBlockMinutes: number; executedMinutes: number }[];
  tasks: {
    completed: number;
    created: number;
    dueTotal: number;
    doneOnTime: number;
    doneLate: number;
    openOverdue: number;
    stillOpen: number;
  };
  study: { minutes: number; sessions: number; reviews: number; postponedReviews: number };
  goals: {
    title: string;
    unit: string;
    value: number;
    target: number;
    finished: boolean;
    met: boolean;
  }[];
  habits: {
    name: string;
    met: number;
    eligible: number;
    rate: number | null;
    unit: 'days' | 'weeks';
  }[];
  conflicts: { day: ISODate; a: string; b: string; minutes: number }[];
}

const mins = (s: number) => Math.round(s / 60);

export function weeklySummary(i: WeeklyInputs): WeeklySummary {
  const blocks = i.agenda.filter((s) => s.kind === 'block');
  const commitments = i.agenda.filter((s) => s.kind === 'event');
  const dur = (s: { start: string; end: string }) =>
    (Date.parse(s.end) - Date.parse(s.start)) / 60_000;
  const linked = blocks.filter((b) => b.subjectId !== null || b.taskId !== null);
  const realized = linked.reduce(
    (sum, b) =>
      sum +
      actualSecondsInBlock(
        { start: b.start, end: b.end, subjectId: b.subjectId, taskId: b.taskId },
        i.activities,
      ),
    0,
  );
  const linkedMinutes = Math.round(linked.reduce((s, b) => s + dur(b), 0));
  const blockByDay = new Map<string, number>();
  for (const b of blocks) blockByDay.set(b.day, (blockByDay.get(b.day) ?? 0) + dur(b));

  return {
    weekStart: i.weekStart,
    weekEnd: addDays(i.weekStart, 6),
    planned: {
      commitmentsMinutes: Math.round(commitments.reduce((s, c) => s + dur(c), 0)),
      blocksMinutes: Math.round(blocks.reduce((s, b) => s + dur(b), 0)),
      linkedBlocksMinutes: linkedMinutes,
      realizedInLinkedBlocksMinutes: mins(realized),
      blockAdherence: safeRate(mins(realized), linkedMinutes),
    },
    executed: {
      activityMinutes: mins(i.activityStats.totals.seconds),
      studyMinutes: mins(i.study.totals.seconds),
      activities: i.activityStats.totals.count,
    },
    days: i.activityStats.days.map((d) => ({
      date: d.date,
      plannedBlockMinutes: Math.round(blockByDay.get(d.date) ?? 0),
      executedMinutes: mins(d.seconds),
    })),
    tasks: {
      completed: i.tasks.completed,
      created: i.tasks.created,
      dueTotal: i.tasks.due.total,
      doneOnTime: i.tasks.due.doneOnTime,
      doneLate: i.tasks.due.doneLate,
      openOverdue: i.tasks.due.openOverdue,
      stillOpen: i.tasks.due.open,
    },
    study: {
      minutes: mins(i.study.totals.seconds),
      sessions: i.study.sessions.count,
      reviews: i.study.reviews.attempts,
      postponedReviews: i.study.reviews.postponed,
    },
    goals: i.goals.goals.flatMap((g) => {
      const c = g.cycles.at(-1);
      if (!c) return [];
      return [
        {
          title: g.title,
          unit: g.unit,
          value: c.value,
          target: c.target,
          finished: c.complete,
          met: c.target > 0 && c.value >= c.target,
        },
      ];
    }),
    habits: i.habits.map((h) => ({
      name: h.name,
      met: h.consistency.met,
      eligible: h.consistency.eligible,
      rate: h.consistency.rate,
      unit: h.consistency.unit,
    })),
    conflicts: findConflicts(i.agenda).map((c) => ({
      day: i.agenda.find((s) => s.id === c.b.id)?.day ?? i.weekStart,
      a: c.a.title,
      b: c.b.title,
      minutes: c.overlapMinutes,
    })),
  };
}

/** Linhas "métrica, valor, unidade" para exportar o resumo em CSV. */
export function weeklySummaryRows(s: WeeklySummary): (string | number | null)[][] {
  return [
    ['Semana', `${s.weekStart} a ${s.weekEnd}`, ''],
    ['Compromissos planejados', s.planned.commitmentsMinutes, 'min'],
    ['Blocos planejados', s.planned.blocksMinutes, 'min'],
    ['Blocos vinculados a matéria/tarefa', s.planned.linkedBlocksMinutes, 'min'],
    ['Realizado dentro dos blocos vinculados', s.planned.realizedInLinkedBlocksMinutes, 'min'],
    [
      'Aderência aos blocos',
      s.planned.blockAdherence === null ? null : Math.round(s.planned.blockAdherence * 1000) / 10,
      '%',
    ],
    ['Tempo de atividades', s.executed.activityMinutes, 'min'],
    ['Tempo de estudo', s.study.minutes, 'min'],
    ['Sessões de foco', s.study.sessions, 'sessões'],
    ['Revisões feitas', s.study.reviews, 'revisões'],
    ['Revisões adiadas', s.study.postponedReviews, 'revisões'],
    ['Tarefas concluídas', s.tasks.completed, 'tarefas'],
    ['Tarefas criadas', s.tasks.created, 'tarefas'],
    ['Prazos da semana', s.tasks.dueTotal, 'tarefas'],
    ['Concluídas no prazo', s.tasks.doneOnTime, 'tarefas'],
    ['Concluídas com atraso', s.tasks.doneLate, 'tarefas'],
    ['Abertas vencidas', s.tasks.openOverdue, 'tarefas'],
    ['Conflitos na agenda', s.conflicts.length, 'conflitos'],
    ...s.goals.map((g) => [`Meta: ${g.title}`, g.value, `${g.unit} de ${String(g.target)}`]),
    ...s.habits.map((h) => [
      `Hábito: ${h.name}`,
      h.met,
      `de ${String(h.eligible)} ${h.unit === 'weeks' ? 'semanas' : 'dias'}`,
    ]),
  ];
}
