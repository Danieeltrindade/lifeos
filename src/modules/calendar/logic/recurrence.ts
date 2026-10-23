/**
 * Expansão de recorrências (subconjunto da RFC 5545) — ADR-026.
 *
 * Suportado: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY; INTERVAL; BYDAY (WEEKLY: MO,TU…;
 * MONTHLY: um dia da semana com posição, ex.: 2MO, -1FR); COUNT; UNTIL (data ou instante UTC).
 * Qualquer outra parte faz `parseRule` devolver null e a interface mostra só a primeira
 * ocorrência com um aviso — nunca ocorrências inventadas.
 *
 * Princípios:
 *  - ocorrências são geradas SOB DEMANDA, apenas na janela pedida (nunca cópias no banco,
 *    nunca laços infinitos: há um teto de iterações);
 *  - a regra é aplicada à data/hora LOCAL do fuso do evento, então "toda segunda às 19 h"
 *    continua às 19 h depois da mudança do horário de verão;
 *  - exceções (ocorrência cancelada ou alterada) são identificadas pelo início ORIGINAL.
 */
import { addMonths, isoDateFromParts, weekdayOf, zonedParts, zonedToUtc } from '@/lib/zoned';
import type { ISODate } from '@/lib/date';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  freq: Frequency;
  interval: number;
  /** WEEKLY: dias 0..6. */
  byWeekday: number[];
  /** MONTHLY: n-ésimo dia da semana (n = 1..4 ou −1 = último). */
  byMonthWeekday: { weekday: number; nth: number } | null;
  count: number | null;
  /** Último dia (inclusive) em que pode haver ocorrência, no calendário local do evento. */
  until: ISODate | null;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export function parseRule(text: string | null | undefined): RecurrenceRule | null {
  if (!text) return null;
  const parts = new Map<string, string>();
  for (const piece of text.split(';')) {
    const [key, value] = piece.split('=');
    if (!key || value === undefined) return null;
    parts.set(key, value);
  }
  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  for (const key of parts.keys()) {
    if (!['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL'].includes(key)) return null;
  }
  const interval = Number(parts.get('INTERVAL') ?? '1');
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return null;
  const countText = parts.get('COUNT');
  const count = countText === undefined ? null : Number(countText);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 1000)) return null;

  let until: ISODate | null = null;
  const untilText = parts.get('UNTIL');
  if (untilText) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(untilText);
    if (!m) return null;
    until = `${m[1]}-${m[2]}-${m[3]}`;
  }

  const byWeekday: number[] = [];
  let byMonthWeekday: RecurrenceRule['byMonthWeekday'] = null;
  const byDay = parts.get('BYDAY');
  if (byDay) {
    for (const token of byDay.split(',')) {
      const m = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token);
      if (!m?.[2]) return null;
      const weekday = DAY_CODES.indexOf(m[2] as (typeof DAY_CODES)[number]);
      if (m[1]) {
        const nth = Number(m[1]);
        if (freq !== 'MONTHLY' || byMonthWeekday || ![1, 2, 3, 4, -1].includes(nth)) return null;
        byMonthWeekday = { weekday, nth };
      } else {
        if (freq !== 'WEEKLY') return null;
        byWeekday.push(weekday);
      }
    }
  }
  return {
    freq,
    interval,
    byWeekday: [...new Set(byWeekday)].sort((a, b) => a - b),
    byMonthWeekday,
    count,
    until,
  };
}

export function formatRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byWeekday.length > 0)
    parts.push(`BYDAY=${rule.byWeekday.map((d) => DAY_CODES[d]).join(',')}`);
  if (rule.byMonthWeekday) {
    parts.push(`BYDAY=${rule.byMonthWeekday.nth}${DAY_CODES[rule.byMonthWeekday.weekday] ?? 'MO'}`);
  }
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}T235959Z`);
  return parts.join(';');
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const NTH_NAMES: Record<number, string> = { 1: '1ª', 2: '2ª', 3: '3ª', 4: '4ª', [-1]: 'última' };

/** Descrição em português ("Toda semana: segunda e quarta, 10 vezes"). */
export function describeRule(rule: RecurrenceRule): string {
  const every = rule.interval === 1;
  let text: string;
  switch (rule.freq) {
    case 'DAILY':
      text = every ? 'Todo dia' : `A cada ${rule.interval} dias`;
      break;
    case 'WEEKLY':
      text = every ? 'Toda semana' : `A cada ${rule.interval} semanas`;
      if (rule.byWeekday.length > 0) {
        const names = rule.byWeekday.map((d) => WEEKDAY_NAMES[d] ?? '');
        text += `: ${names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1) ?? ''}` : (names[0] ?? '')}`;
      }
      break;
    case 'MONTHLY':
      text = every ? 'Todo mês' : `A cada ${rule.interval} meses`;
      if (rule.byMonthWeekday) {
        text += ` (${NTH_NAMES[rule.byMonthWeekday.nth] ?? ''} ${WEEKDAY_NAMES[rule.byMonthWeekday.weekday] ?? ''})`;
      }
      break;
    case 'YEARLY':
      text = every ? 'Todo ano' : `A cada ${rule.interval} anos`;
      break;
  }
  if (rule.count !== null) text += `, ${rule.count} ${rule.count === 1 ? 'vez' : 'vezes'}`;
  if (rule.until) {
    const [y, m, d] = rule.until.split('-');
    text += `, até ${d ?? ''}/${m ?? ''}/${y ?? ''}`;
  }
  return text;
}

function addDaysIso(iso: ISODate, days: number): ISODate {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysDiff(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** n-ésimo dia da semana de um mês (nth = −1: último). null se não existir. */
function nthWeekdayOfMonth(monthStart: ISODate, weekday: number, nth: number): ISODate | null {
  if (nth > 0) {
    const first = (weekday - weekdayOf(monthStart) + 7) % 7;
    const candidate = addDaysIso(monthStart, first + (nth - 1) * 7);
    return candidate.slice(0, 7) === monthStart.slice(0, 7) ? candidate : null;
  }
  const nextMonth = addMonths(monthStart, 1);
  const last = addDaysIso(nextMonth, -1);
  const back = (weekdayOf(last) - weekday + 7) % 7;
  return addDaysIso(last, -back);
}

const MAX_ITERATIONS = 5000;

/**
 * Datas LOCAIS (no calendário do evento) em que a série ocorre, de `firstDate` em diante,
 * até `windowEnd` (exclusive). Respeita COUNT contando desde o início da série.
 */
export function occurrenceDates(
  rule: RecurrenceRule,
  firstDate: ISODate,
  windowEnd: ISODate,
): ISODate[] {
  const out: ISODate[] = [];
  const limit = rule.until && rule.until < windowEnd ? addDaysIso(rule.until, 1) : windowEnd;
  let emitted = 0;
  const push = (date: ISODate): boolean => {
    if (date < firstDate) return true;
    if (date >= limit) return false;
    if (rule.count !== null && emitted >= rule.count) return false;
    emitted += 1;
    out.push(date);
    return true;
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    switch (rule.freq) {
      case 'DAILY': {
        if (!push(addDaysIso(firstDate, i * rule.interval))) return out;
        break;
      }
      case 'WEEKLY': {
        const days = rule.byWeekday.length > 0 ? rule.byWeekday : [weekdayOf(firstDate)];
        // Semana começando no domingo que contém o início; avança INTERVAL semanas.
        const weekStart = addDaysIso(firstDate, -weekdayOf(firstDate) + i * 7 * rule.interval);
        for (const d of days) {
          if (!push(addDaysIso(weekStart, d))) return out;
        }
        break;
      }
      case 'MONTHLY': {
        const monthStart = addMonths(`${firstDate.slice(0, 7)}-01`, i * rule.interval);
        if (monthStart >= limit) return out;
        let date: ISODate | null;
        if (rule.byMonthWeekday) {
          date = nthWeekdayOfMonth(
            monthStart,
            rule.byMonthWeekday.weekday,
            rule.byMonthWeekday.nth,
          );
        } else {
          // Dia 31 só nos meses que têm dia 31 (como a RFC 5545), nunca "puxado" para o 30.
          const candidate = `${monthStart.slice(0, 7)}-${firstDate.slice(8, 10)}`;
          date =
            Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ||
            new Date(`${candidate}T00:00:00Z`).toISOString().slice(0, 10) !== candidate
              ? null
              : candidate;
        }
        if (date && !push(date)) return out;
        break;
      }
      case 'YEARLY': {
        const year = Number(firstDate.slice(0, 4)) + i * rule.interval;
        const candidate = `${String(year)}${firstDate.slice(4)}`;
        const valid = new Date(`${candidate}T00:00:00Z`).toISOString().slice(0, 10) === candidate;
        if (candidate >= limit) return out;
        if (valid && !push(candidate)) return out;
        break;
      }
    }
  }
  return out;
}

export interface EventSeries {
  id: string;
  allDay: boolean;
  /** Evento com horário. */
  startsAt: string | null;
  endsAt: string | null;
  /** Dia inteiro: [startDate, endDate). */
  startDate: ISODate | null;
  endDate: ISODate | null;
  timezone: string;
  recurrenceRule: string | null;
}

export interface EventException {
  eventId: string;
  originalStartsAt: string | null;
  originalDate: ISODate | null;
  kind: 'cancelled' | 'modified';
  newTitle: string | null;
  newStartsAt: string | null;
  newEndsAt: string | null;
}

export interface Occurrence {
  eventId: string;
  /** Chave estável da ocorrência: início original (instante ou data). */
  key: string;
  allDay: boolean;
  start: string;
  end: string;
  isRecurring: boolean;
  /** Regra não suportada: apenas a primeira ocorrência é mostrada. */
  unsupportedRule: boolean;
  modified: boolean;
  title: string | null;
}

/**
 * Ocorrências de um evento que intersectam [windowStart, windowEnd) (instantes ISO).
 * Para dia inteiro, `start`/`end` são datas; para eventos com horário, instantes ISO.
 */
export function expandEvent(
  event: EventSeries,
  exceptions: readonly EventException[],
  windowStart: string,
  windowEnd: string,
): Occurrence[] {
  const rule = parseRule(event.recurrenceRule);
  const unsupported = Boolean(event.recurrenceRule) && rule === null;
  const ws = Date.parse(windowStart);
  const we = Date.parse(windowEnd);
  const own = exceptions.filter((x) => x.eventId === event.id);
  const out: Occurrence[] = [];

  if (event.allDay) {
    if (!event.startDate || !event.endDate) return [];
    const length = daysDiff(event.endDate, event.startDate);
    // Janela em datas locais, com folga de um dia para fusos distantes.
    const winStartDate = addDaysIso(new Date(ws).toISOString().slice(0, 10), -1 - length);
    const winEndDate = addDaysIso(new Date(we).toISOString().slice(0, 10), 2);
    const dates = rule ? occurrenceDates(rule, event.startDate, winEndDate) : [event.startDate];
    for (const date of dates) {
      const end = addDaysIso(date, length);
      if (end <= winStartDate || date >= winEndDate) continue;
      const ex = own.find((x) => x.originalDate === date);
      if (ex?.kind === 'cancelled') continue;
      out.push({
        eventId: event.id,
        key: date,
        allDay: true,
        start: date,
        end,
        isRecurring: rule !== null,
        unsupportedRule: unsupported,
        modified: ex?.kind === 'modified',
        title: ex?.newTitle ?? null,
      });
    }
    return out;
  }

  if (!event.startsAt || !event.endsAt) return [];
  const durationMs = Date.parse(event.endsAt) - Date.parse(event.startsAt);
  if (!rule) {
    if (Date.parse(event.startsAt) < we && Date.parse(event.endsAt) > ws) {
      out.push({
        eventId: event.id,
        key: event.startsAt,
        allDay: false,
        start: event.startsAt,
        end: event.endsAt,
        isRecurring: false,
        unsupportedRule: unsupported,
        modified: false,
        title: null,
      });
    }
    return out;
  }

  const startParts = zonedParts(new Date(event.startsAt), event.timezone);
  const firstDate = isoDateFromParts(startParts);
  const time = `${String(startParts.hour).padStart(2, '0')}:${String(startParts.minute).padStart(2, '0')}`;
  // Datas candidatas: até um dia depois do fim da janela (fusos) — o filtro por instante decide.
  const lastDate = addDaysIso(new Date(we).toISOString().slice(0, 10), 2);
  for (const date of occurrenceDates(rule, firstDate, lastDate)) {
    const start = zonedToUtc(date, time, event.timezone);
    const originalIso = start.toISOString();
    const ex = own.find(
      (x) => x.originalStartsAt !== null && Date.parse(x.originalStartsAt) === start.getTime(),
    );
    if (ex?.kind === 'cancelled') continue;
    const s = ex?.newStartsAt ? Date.parse(ex.newStartsAt) : start.getTime();
    const e = ex?.newEndsAt ? Date.parse(ex.newEndsAt) : start.getTime() + durationMs;
    if (s >= we || e <= ws) continue;
    out.push({
      eventId: event.id,
      key: originalIso,
      allDay: false,
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      isRecurring: true,
      unsupportedRule: false,
      modified: ex?.kind === 'modified',
      title: ex?.newTitle ?? null,
    });
  }
  return out;
}
