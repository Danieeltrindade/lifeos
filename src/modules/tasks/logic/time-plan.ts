/**
 * Estimado × planejado × realizado de UMA tarefa (docs/metrics.md §4).
 *
 *  - ESTIMADO: tasks.estimate_minutes (o que o usuário acha que vai levar);
 *  - PLANEJADO: soma dos blocos de calendário ligados à tarefa (tempo reservado);
 *  - REALIZADO: soma das atividades ligadas à tarefa (sessões de foco e lançamentos, pausas
 *    descontadas).
 * Nenhum desses números conclui a tarefa: concluir é sempre uma ação explícita.
 */
import { safeRate } from '@/modules/analytics/logic/metrics';

export interface TaskTimePlan {
  estimatedMinutes: number | null;
  plannedMinutes: number;
  /** Parte do planejado que ainda está no futuro. */
  plannedFutureMinutes: number;
  actualMinutes: number;
  /** Realizado − estimado (null sem estimativa). */
  diffMinutes: number | null;
  /** (realizado − estimado) ÷ estimado; null sem estimativa. */
  diffRate: number | null;
  /** Estimado − realizado, nunca negativo (null sem estimativa). */
  remainingMinutes: number | null;
}

export function taskTimePlan(input: {
  estimateMinutes: number | null;
  actualSeconds: number;
  blocks: readonly { start: string; end: string }[];
  now: Date;
}): TaskTimePlan {
  const nowMs = input.now.getTime();
  let planned = 0;
  let future = 0;
  for (const b of input.blocks) {
    const s = Date.parse(b.start);
    const e = Date.parse(b.end);
    if (!(e > s)) continue;
    planned += (e - s) / 60_000;
    if (e > nowMs) future += (e - Math.max(s, nowMs)) / 60_000;
  }
  const actual = Math.round(input.actualSeconds / 60);
  const est =
    input.estimateMinutes !== null && input.estimateMinutes > 0 ? input.estimateMinutes : null;
  return {
    estimatedMinutes: est,
    plannedMinutes: Math.round(planned),
    plannedFutureMinutes: Math.round(future),
    actualMinutes: actual,
    diffMinutes: est === null ? null : actual - est,
    diffRate: est === null ? null : safeRate(actual - est, est),
    remainingMinutes: est === null ? null : Math.max(0, est - actual),
  };
}
