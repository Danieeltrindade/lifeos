/**
 * Regras de hábitos (docs/data-model.md §9.6) — funções puras, testadas.
 *
 *  - Dia ELEGÍVEL: dia em que o hábito é esperado. "Todo dia": todos a partir do início;
 *    "dias da semana": só os dias escolhidos. "N vezes por semana" é avaliado por SEMANA.
 *  - Marcação CUMPRIDA: existe e, quando o hábito tem meta por marcação (ex.: 20 páginas),
 *    o valor atinge a meta. Marcação abaixo da meta fica registrada, mas não conta.
 *  - SEQUÊNCIA: dias elegíveis consecutivos cumpridos (ou semanas, no modo semanal). Dias
 *    não elegíveis são ignorados — quem treina seg/qua/sex não perde a sequência na terça.
 *    O período atual (hoje / esta semana) ainda está em andamento: se não foi cumprido,
 *    não quebra a sequência, apenas não soma.
 *  - CONSISTÊNCIA: cumpridos ÷ elegíveis numa janela — mais informativa que a sequência.
 */
import type { ISODate } from '@/lib/date';
import { dateRange, startOfWeek, weekdayOf } from '@/lib/zoned';

export type ScheduleKind = 'daily' | 'weekdays' | 'times_per_week';

export interface HabitRule {
  scheduleKind: ScheduleKind;
  /** 0 = domingo … 6 = sábado (apenas "weekdays"). */
  weekdays: number[] | null;
  timesPerWeek: number | null;
  targetValue: number | null;
  startOn: ISODate;
}

export interface Checkin {
  localDate: ISODate;
  value: number | null;
}

function addDays(iso: ISODate, days: number): ISODate {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isMet(
  habit: Pick<HabitRule, 'targetValue'>,
  checkin: Checkin | undefined,
): boolean {
  if (!checkin) return false;
  if (habit.targetValue === null) return true;
  return (checkin.value ?? 0) >= habit.targetValue;
}

/** O hábito é esperado neste dia? (no modo semanal, qualquer dia pode contar) */
export function isEligibleDay(habit: HabitRule, date: ISODate): boolean {
  if (date < habit.startOn) return false;
  if (habit.scheduleKind === 'weekdays') return (habit.weekdays ?? []).includes(weekdayOf(date));
  return true;
}

function metDates(habit: HabitRule, checkins: readonly Checkin[]): Set<ISODate> {
  return new Set(checkins.filter((c) => isMet(habit, c)).map((c) => c.localDate));
}

export interface WeekProgress {
  weekStart: ISODate;
  done: number;
  target: number;
}

/** Progresso da semana que contém `date` (modo "N vezes por semana"). */
export function weekProgress(
  habit: HabitRule,
  checkins: readonly Checkin[],
  date: ISODate,
  weekStartsOn: number,
): WeekProgress {
  const weekStart = startOfWeek(date, weekStartsOn);
  const met = metDates(habit, checkins);
  const done = dateRange(weekStart, addDays(weekStart, 7)).filter(
    (d) => d >= habit.startOn && met.has(d),
  ).length;
  return { weekStart, done, target: habit.timesPerWeek ?? 1 };
}

export interface Streak {
  current: number;
  best: number;
  unit: 'days' | 'weeks';
}

/**
 * Sequência atual e melhor sequência até `today` (inclusive).
 */
export function computeStreak(
  habit: HabitRule,
  checkins: readonly Checkin[],
  today: ISODate,
  weekStartsOn: number,
): Streak {
  const met = metDates(habit, checkins);
  if (habit.scheduleKind === 'times_per_week') {
    const target = habit.timesPerWeek ?? 1;
    const firstWeek = startOfWeek(habit.startOn, weekStartsOn);
    const currentWeek = startOfWeek(today, weekStartsOn);
    const weeks: boolean[] = [];
    for (let w = firstWeek; w <= currentWeek; w = addDays(w, 7)) {
      const count = dateRange(w, addDays(w, 7)).filter(
        (d) => d >= habit.startOn && d <= today && met.has(d),
      ).length;
      weeks.push(count >= target);
    }
    return { ...streaksFrom(weeks), unit: 'weeks' };
  }
  const flags = dateRange(habit.startOn, addDays(today, 1))
    .filter((d) => isEligibleDay(habit, d))
    .map((d) => met.has(d));
  return { ...streaksFrom(flags), unit: 'days' };
}

/** Recebe a sequência de períodos (o último é o atual, ainda em andamento). */
function streaksFrom(periods: boolean[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const ok of periods) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // Período atual não cumprido ainda não quebra: conta a sequência até o anterior.
  let current = 0;
  const lastIndex = periods.length - 1;
  const startIndex = periods[lastIndex] === false ? lastIndex - 1 : lastIndex;
  for (let i = startIndex; i >= 0 && periods[i]; i--) current += 1;
  return { current, best };
}

export interface Consistency {
  eligible: number;
  met: number;
  /** 0..1, ou null quando não houve período elegível. */
  rate: number | null;
}

/**
 * Consistência nos últimos `days` dias até hoje. O dia de hoje só entra se já foi cumprido
 * (ainda está em andamento). No modo semanal, conta semanas completas cumpridas.
 */
export function computeConsistency(
  habit: HabitRule,
  checkins: readonly Checkin[],
  today: ISODate,
  days: number,
  weekStartsOn: number,
): Consistency {
  const met = metDates(habit, checkins);
  const from = addDays(today, -(days - 1));
  if (habit.scheduleKind === 'times_per_week') {
    const target = habit.timesPerWeek ?? 1;
    let eligible = 0;
    let ok = 0;
    const currentWeek = startOfWeek(today, weekStartsOn);
    for (let w = startOfWeek(from, weekStartsOn); w <= currentWeek; w = addDays(w, 7)) {
      if (addDays(w, 6) < habit.startOn) continue;
      const count = dateRange(w, addDays(w, 7)).filter((d) => d <= today && met.has(d)).length;
      const done = count >= target;
      if (w === currentWeek && !done) continue;
      eligible += 1;
      if (done) ok += 1;
    }
    return { eligible, met: ok, rate: eligible === 0 ? null : ok / eligible };
  }
  let eligible = 0;
  let ok = 0;
  for (const d of dateRange(from, addDays(today, 1))) {
    if (!isEligibleDay(habit, d)) continue;
    const done = met.has(d);
    if (d === today && !done) continue;
    eligible += 1;
    if (done) ok += 1;
  }
  return { eligible, met: ok, rate: eligible === 0 ? null : ok / eligible };
}

/**
 * Estado de cada dia na grade de histórico. No modo semanal, um dia sem marcação é
 * apenas "livre" (open) — não é falta, porque a meta é da semana.
 */
export type DayState =
  'met' | 'partial' | 'missed' | 'not_eligible' | 'future' | 'pending' | 'open';

export function dayState(
  habit: HabitRule,
  checkin: Checkin | undefined,
  date: ISODate,
  today: ISODate,
): DayState {
  if (date > today) return 'future';
  if (isMet(habit, checkin)) return 'met';
  if (checkin) return 'partial';
  if (!isEligibleDay(habit, date)) return 'not_eligible';
  if (habit.scheduleKind === 'times_per_week') return 'open';
  return date === today ? 'pending' : 'missed';
}

/** Deve aparecer em "Hábitos de hoje"? */
export function isDueToday(
  habit: HabitRule,
  checkins: readonly Checkin[],
  today: ISODate,
  weekStartsOn: number,
): boolean {
  if (habit.scheduleKind === 'times_per_week') {
    const p = weekProgress(habit, checkins, today, weekStartsOn);
    return (
      today >= habit.startOn && (p.done < p.target || checkins.some((c) => c.localDate === today))
    );
  }
  return isEligibleDay(habit, today);
}

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function describeSchedule(habit: HabitRule): string {
  switch (habit.scheduleKind) {
    case 'daily':
      return 'Todo dia';
    case 'weekdays':
      return (habit.weekdays ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_SHORT[d])
        .join(', ');
    case 'times_per_week':
      return `${String(habit.timesPerWeek ?? 1)}× por semana`;
  }
}
