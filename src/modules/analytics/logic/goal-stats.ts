import type { GoalStats } from '../data/stats-api';
import { safeRate } from './metrics';

type GoalRow = GoalStats['goals'][number];

/**
 * Ciclos ENCERRADOS de uma meta e quantos atingiram o alvo em vigor naquele ciclo.
 * O ciclo em andamento não entra na taxa (ainda pode ser cumprido).
 */
export function goalCycleSummary(g: Pick<GoalRow, 'cycles'>) {
  const finished = g.cycles.filter((c) => c.complete);
  const met = finished.filter((c) => c.target > 0 && c.value >= c.target).length;
  const open = g.cycles.find((c) => !c.complete) ?? null;
  return { finished: finished.length, met, rate: safeRate(met, finished.length), open };
}
