/**
 * Consistência de hábitos num PERÍODO [from, to) — docs/metrics.md §6.
 *
 * Reaproveita as regras do módulo de hábitos (dia elegível, marcação cumprida). Diferenças
 * em relação ao painel de hábitos ("últimos N dias"): aqui a janela é o período escolhido,
 * limitada a hoje; dias futuros nunca contam e o dia/semana em andamento só conta se já foi
 * cumprido.
 */
import { addDays, type ISODate } from '@/lib/date';
import { dateRange, startOfWeek } from '@/lib/zoned';
import { isEligibleDay, isMet, type Checkin, type HabitRule } from '@/modules/habits/logic/habits';
import { safeRate } from './metrics';

export interface RangeConsistency {
  /** Dias (ou semanas, no modo "N por semana") em que o hábito era esperado. */
  eligible: number;
  met: number;
  rate: number | null;
  unit: 'days' | 'weeks';
}

export function consistencyInRange(
  habit: HabitRule,
  checkins: readonly Checkin[],
  from: ISODate,
  to: ISODate,
  today: ISODate,
  weekStartsOn: number,
): RangeConsistency {
  const metSet = new Set(checkins.filter((c) => isMet(habit, c)).map((c) => c.localDate));
  const lastDay = to <= today ? addDays(to, -1) : today;
  if (habit.scheduleKind === 'times_per_week') {
    const target = habit.timesPerWeek ?? 1;
    let eligible = 0;
    let met = 0;
    // Semanas que COMEÇAM dentro do período (semanas parciais no início ficam de fora).
    for (let w = startOfWeek(from, weekStartsOn); w <= lastDay; w = addDays(w, 7)) {
      if (w < from) continue;
      const weekEnd = addDays(w, 7);
      if (addDays(weekEnd, -1) < habit.startOn) continue;
      const count = dateRange(w, weekEnd).filter((d) => d <= today && metSet.has(d)).length;
      const done = count >= target;
      const finished = addDays(weekEnd, -1) < today;
      if (!finished && !done) continue;
      eligible += 1;
      if (done) met += 1;
    }
    return { eligible, met, rate: safeRate(met, eligible), unit: 'weeks' };
  }
  let eligible = 0;
  let met = 0;
  for (const d of dateRange(from, addDays(lastDay, 1))) {
    if (!isEligibleDay(habit, d)) continue;
    const done = metSet.has(d);
    if (d === today && !done) continue;
    eligible += 1;
    if (done) met += 1;
  }
  return { eligible, met, rate: safeRate(met, eligible), unit: 'days' };
}
