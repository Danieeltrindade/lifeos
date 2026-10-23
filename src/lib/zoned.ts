/**
 * Conversões entre instantes (UTC) e data/hora LOCAL de um fuso IANA, sem bibliotecas.
 *
 * Por que existe: o "dia" do usuário é o do fuso do PERFIL, não o do navegador
 * (docs/data-model.md, "Estratégia de datas"). Um formulário que pede "início 14:00"
 * precisa gravar o instante correto mesmo que o navegador esteja em outro fuso, e um dia
 * pode ter 23 ou 25 horas (horário de verão).
 */
import type { ISODate } from './date';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Deslocamento (ms) do fuso em relação ao UTC no instante dado. */
export function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

export function isoDateFromParts(p: Pick<ZonedParts, 'year' | 'month' | 'day'>): ISODate {
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

function parseIsoDate(isoDate: ISODate): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = isoDate.split('-').map(Number);
  return [y, m, d];
}

/**
 * Instante correspondente a uma data e hora LOCAIS no fuso.
 * Horário inexistente (salto do horário de verão) avança para o primeiro instante válido;
 * horário ambíguo (recuo) usa a primeira ocorrência.
 */
export function zonedToUtc(isoDate: ISODate, time: string, timeZone: string): Date {
  const [y, m, d] = parseIsoDate(isoDate);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Duas iterações resolvem qualquer fuso real (o deslocamento muda no máximo uma vez).
  const first = naive - offsetMs(new Date(naive), timeZone);
  const second = naive - offsetMs(new Date(first), timeZone);
  const third = naive - offsetMs(new Date(second), timeZone);
  const candidates = [...new Set([first, second, third])];
  const matches = candidates.filter((ms) => {
    const p = zonedParts(new Date(ms), timeZone);
    return p.year === y && p.month === m && p.day === d && p.hour === hh && p.minute === mm;
  });
  return new Date(matches.length > 0 ? Math.min(...matches) : Math.max(...candidates));
}

/** Início do dia local (00:00) como instante. */
export function startOfLocalDay(isoDate: ISODate, timeZone: string): Date {
  return zonedToUtc(isoDate, '00:00', timeZone);
}

/** Valor para <input type="datetime-local"> no fuso do perfil. */
export function toLocalInput(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${isoDateFromParts(p)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Converte o valor de um <input type="datetime-local"> (no fuso do perfil) para ISO UTC. */
export function fromLocalInput(value: string, timeZone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  return zonedToUtc(match[1], match[2], timeZone).toISOString();
}

/** Hora local "HH:MM" de um instante. */
export function localTimeOf(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Dia da semana (0 = domingo … 6 = sábado) de uma data de calendário. */
export function weekdayOf(isoDate: ISODate): number {
  const [y, m, d] = parseIsoDate(isoDate);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Primeiro dia da semana que contém a data, dado o dia em que a semana começa. */
export function startOfWeek(isoDate: ISODate, weekStartsOn: number): ISODate {
  const diff = (weekdayOf(isoDate) - weekStartsOn + 7) % 7;
  const [y, m, d] = parseIsoDate(isoDate);
  return new Date(Date.UTC(y, m - 1, d - diff)).toISOString().slice(0, 10);
}

export function startOfMonth(isoDate: ISODate): ISODate {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(isoDate: ISODate, months: number): ISODate {
  const [y, m, d] = parseIsoDate(isoDate);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Datas de calendário de `from` (inclusive) a `to` (exclusive). */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const [y, m, d] = parseIsoDate(from);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 3700; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso >= to) break;
    out.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Segundos entre dois instantes ISO (nunca negativo). */
export function secondsBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
}
