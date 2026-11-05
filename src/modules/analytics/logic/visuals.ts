/**
 * Dados dos gráficos novos das Análises (funções puras, testadas em visuals.test.ts):
 *  - tempo de atividades repartido por DIA e HORA locais (uma atividade que cruza a
 *    meia-noite ou várias horas é dividida proporcionalmente; pausas já descontadas);
 *  - mapa de calor dia da semana × hora e o melhor horário;
 *  - ritmo de uma meta no ciclo em andamento (adiantado/atrasado e projeção);
 *  - calendário do ano de um hábito.
 */
import { addDays, daysBetween, type ISODate } from '@/lib/date';
import { dateRange, isoDateFromParts, startOfWeek, weekdayOf, zonedParts } from '@/lib/zoned';
import {
  computeStreak,
  isEligibleDay,
  isMet,
  type Checkin,
  type HabitRule,
} from '@/modules/habits/logic/habits';

// ---------------------------------------------------------------------------- tempo local

export interface TimedRecord {
  started_at: string;
  ended_at: string;
  /** Segundos líquidos (pausas descontadas). */
  duration_seconds: number;
}

export interface LocalSlice {
  date: ISODate;
  hour: number;
  seconds: number;
}

const QUARTER = 15 * 60 * 1000;

/**
 * Reparte o tempo líquido de um registro pelas horas locais que ele ocupa. Os cortes são em
 * múltiplos de 15 min (UTC), o que coincide com o início das horas locais em qualquer fuso
 * real. O tempo líquido é distribuído na proporção do intervalo bruto.
 */
export function splitByLocalHour(record: TimedRecord, timeZone: string): LocalSlice[] {
  const start = Date.parse(record.started_at);
  const end = Date.parse(record.ended_at);
  if (!(end > start) || record.duration_seconds <= 0) return [];
  const ratio = record.duration_seconds / ((end - start) / 1000);
  const out: LocalSlice[] = [];
  let t = start;
  while (t < end) {
    const next = Math.min(end, (Math.floor(t / QUARTER) + 1) * QUARTER);
    const p = zonedParts(new Date(t), timeZone);
    const date = isoDateFromParts(p);
    const seconds = ((next - t) / 1000) * ratio;
    const last = out[out.length - 1];
    if (last?.date === date && last.hour === p.hour) last.seconds += seconds;
    else out.push({ date, hour: p.hour, seconds });
    t = next;
  }
  return out;
}

/** Segundos por dia local e por chave (ex.: categoria), só dentro de [from, to). */
export function secondsByDayAndKey<T extends TimedRecord>(
  records: readonly T[],
  keyOf: (r: T) => string,
  timeZone: string,
  from: ISODate,
  to: ISODate,
): Map<ISODate, Map<string, number>> {
  const days = new Map<ISODate, Map<string, number>>();
  for (const r of records) {
    const key = keyOf(r);
    for (const s of splitByLocalHour(r, timeZone)) {
      if (s.date < from || s.date >= to) continue;
      const day = days.get(s.date) ?? new Map<string, number>();
      day.set(key, (day.get(key) ?? 0) + s.seconds);
      days.set(s.date, day);
    }
  }
  return days;
}

// ---------------------------------------------------------------------------- mapa de calor

export interface HeatmapRow {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** Segundos MÉDIOS por semana em cada hora (0…23). */
  hours: number[];
}

export interface Heatmap {
  rows: HeatmapRow[];
  weeks: number;
  max: number;
  totalSeconds: number;
}

/** Linhas na ordem da semana do perfil (começando em `weekStartsOn`). */
export function hourHeatmap(
  records: readonly TimedRecord[],
  timeZone: string,
  from: ISODate,
  to: ISODate,
  weekStartsOn: number,
): Heatmap {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let total = 0;
  for (const r of records) {
    for (const s of splitByLocalHour(r, timeZone)) {
      if (s.date < from || s.date >= to) continue;
      const row = grid[weekdayOf(s.date)];
      if (row) row[s.hour] = (row[s.hour] ?? 0) + s.seconds;
      total += s.seconds;
    }
  }
  const weeks = Math.max(1, daysBetween(to, from) / 7);
  const rows: HeatmapRow[] = [];
  for (let i = 0; i < 7; i++) {
    const weekday = (weekStartsOn + i) % 7;
    rows.push({ weekday, hours: (grid[weekday] ?? []).map((v) => v / weeks) });
  }
  const max = Math.max(0, ...rows.flatMap((r) => r.hours));
  return { rows, weeks, max, totalSeconds: total };
}

/** Nível 0–4 de uma célula (0 = nada). */
export function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const r = value / max;
  if (r < 0.25) return 1;
  if (r < 0.5) return 2;
  if (r < 0.8) return 3;
  return 4;
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export interface BestSlot {
  weekdays: number[];
  startHour: number;
  /** Hora final (exclusiva). */
  endHour: number;
  text: string;
}

/**
 * Melhor horário: a janela de 1–2 horas com mais tempo médio; outros dias com pelo menos
 * 80 % desse tempo na mesma janela entram juntos ("terça e quinta, das 19h às 21h").
 * Exige ao menos 2 h de dados no total para não tirar conclusão de um registro só.
 */
export function bestSlot(h: Heatmap): BestSlot | null {
  if (h.totalSeconds < 2 * 3600 || h.max <= 0) return null;
  let best = { weekday: 0, hour: 0, value: 0, span: 1 };
  for (const row of h.rows) {
    for (let hour = 0; hour < 24; hour++) {
      const one = row.hours[hour] ?? 0;
      const two = one + (row.hours[hour + 1] ?? 0);
      const pairOk = (row.hours[hour + 1] ?? 0) >= one * 0.6;
      const value = pairOk ? two : one;
      if (value > best.value) {
        best = { weekday: row.weekday, hour, value, span: pairOk && hour < 23 ? 2 : 1 };
      }
    }
  }
  const windowValue = (weekday: number) => {
    const row = h.rows.find((r) => r.weekday === weekday);
    let v = 0;
    for (let i = 0; i < best.span; i++) v += row?.hours[best.hour + i] ?? 0;
    return v;
  };
  const weekdays = h.rows
    .map((r) => r.weekday)
    .filter((w) => w === best.weekday || windowValue(w) >= best.value * 0.8)
    .slice(0, 3);
  const names = weekdays.map((w) => WEEKDAY_NAMES[w] ?? '');
  const days =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1] ?? ''}`
      : names[0];
  const endHour = best.hour + best.span;
  return {
    weekdays,
    startHour: best.hour,
    endHour,
    text: `${days ?? ''}, das ${String(best.hour)}h às ${String(endHour % 24)}h`,
  };
}

// ---------------------------------------------------------------------------- ritmo de metas

export interface CycleLike {
  start: ISODate;
  /** Fim EXCLUSIVO do ciclo; null = sem prazo. */
  end: ISODate | null;
  value: number;
  target: number;
}

export type PaceState = 'done' | 'ahead' | 'on_track' | 'behind' | 'no_deadline';

export interface Pace {
  state: PaceState;
  /** Fração do prazo já transcorrida (0–1); null sem prazo. */
  elapsedShare: number | null;
  /** Quanto deveria ter sido feito até hoje no ritmo linear; null sem prazo. */
  expected: number | null;
  /** value − expected. */
  diff: number | null;
  /** Valor no fim do ciclo mantendo o ritmo atual; null sem prazo. */
  projected: number | null;
  /** Quanto falta por dia (até o fim, contando hoje) para bater a meta; null se já bateu. */
  perDayNeeded: number | null;
  daysLeft: number | null;
}

/** Tolerância para "no ritmo": 5 % do alvo. */
const ON_TRACK = 0.05;

export function goalPace(cycle: CycleLike, today: ISODate): Pace {
  const { start, end, value, target } = cycle;
  if (target > 0 && value >= target) {
    return {
      state: 'done',
      elapsedShare: null,
      expected: null,
      diff: null,
      projected: null,
      perDayNeeded: null,
      daysLeft: end ? Math.max(0, daysBetween(end, today) - 1) : null,
    };
  }
  if (!end || target <= 0) {
    return {
      state: 'no_deadline',
      elapsedShare: null,
      expected: null,
      diff: null,
      projected: null,
      perDayNeeded: null,
      daysLeft: null,
    };
  }
  const total = Math.max(1, daysBetween(end, start));
  const elapsed = Math.min(total, Math.max(1, daysBetween(today, start) + 1));
  const share = elapsed / total;
  const expected = target * share;
  const diff = value - expected;
  const daysLeft = Math.max(0, total - elapsed);
  const state: PaceState =
    Math.abs(diff) <= target * ON_TRACK ? 'on_track' : diff > 0 ? 'ahead' : 'behind';
  return {
    state,
    elapsedShare: share,
    expected,
    diff,
    projected: (value / elapsed) * total,
    perDayNeeded: (target - value) / Math.max(1, daysLeft + 1),
    daysLeft,
  };
}

// ---------------------------------------------------------------------------- calendário do ano

export type DayCell = 'done' | 'missed' | 'off' | 'future' | 'before';

export interface YearCalendar {
  /** Semanas (colunas) com 7 dias cada, começando em `weekStartsOn`. */
  weeks: { start: ISODate; days: { date: ISODate; state: DayCell }[] }[];
  months: { label: string; column: number }[];
  done: number;
  expected: number;
  rate: number | null;
  current: number;
  best: number;
  unit: 'days' | 'weeks';
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Últimas 53 semanas até hoje. "N por semana": qualquer dia conta, nenhum dia é "falta". */
export function habitYear(
  habit: HabitRule,
  checkins: readonly Checkin[],
  today: ISODate,
  weekStartsOn: number,
): YearCalendar {
  const met = new Set(checkins.filter((c) => isMet(habit, c)).map((c) => c.localDate));
  const first = addDays(startOfWeek(today, weekStartsOn), -52 * 7);
  const weekly = habit.scheduleKind === 'times_per_week';
  const weeks: YearCalendar['weeks'] = [];
  const months: YearCalendar['months'] = [];
  let done = 0;
  let expected = 0;
  let lastMonth = '';
  for (let w = 0; w < 53; w++) {
    const start = addDays(first, w * 7);
    const days = dateRange(start, addDays(start, 7)).map((date) => {
      let state: DayCell;
      if (date > today) state = 'future';
      else if (date < habit.startOn) state = 'before';
      else if (met.has(date)) state = 'done';
      else if (weekly || !isEligibleDay(habit, date) || date === today) state = 'off';
      else state = 'missed';
      if (state === 'done') done += 1;
      if (!weekly && (state === 'done' || state === 'missed')) expected += 1;
      return { date, state };
    });
    weeks.push({ start, days });
    const firstOfMonth = days.find((d) => d.date.slice(8) === '01');
    const month = firstOfMonth?.date.slice(0, 7) ?? (w === 0 ? start.slice(0, 7) : '');
    if (month && month !== lastMonth) {
      months.push({ label: MONTHS[Number(month.slice(5)) - 1] ?? '', column: w });
      lastMonth = month;
    }
  }
  const streak = computeStreak(habit, checkins, today, weekStartsOn);
  return {
    weeks,
    months,
    done,
    expected: weekly ? 0 : expected,
    rate: weekly || expected === 0 ? null : done / expected,
    current: streak.current,
    best: streak.best,
    unit: streak.unit,
  };
}
