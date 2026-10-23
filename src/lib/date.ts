/**
 * Datas e horas em pt-BR, SEM depender do fuso implícito do navegador.
 *
 * Dois tipos de valor (ver docs/data-model.md, "Estratégia de datas"):
 *  - instantes (ISO 8601 com fuso, ex.: "2026-10-20T13:00:00Z") — exibidos no fuso do perfil;
 *  - datas de calendário (ISODate "AAAA-MM-DD", ex.: prazos) — não têm fuso e nunca são
 *    convertidas; comparações usam o "hoje" calculado no fuso do perfil.
 */
const LOCALE = 'pt-BR';

/** "AAAA-MM-DD" */
export type ISODate = string;

/** Fuso do navegador — usado apenas como valor inicial (cadastro) e em dados de demonstração. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Fusos IANA disponíveis no navegador (para seletores). */
export function supportedTimeZones(): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** Data de calendário de um instante no fuso indicado. */
export function localDateIn(date: Date, timeZone: string): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
}

function hourIn(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Number(part(parts, 'hour'));
}

export function greetingFor(date: Date, timeZone: string): string {
  const hour = hourIn(date, timeZone);
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function formatLongDate(date: Date, timeZone: string): string {
  const text = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function isoDateToUtcMs(isoDate: ISODate): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Formata uma data de calendário ("22 de out") sem qualquer conversão de fuso. */
export function formatDateOnly(isoDate: ISODate): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: '2-digit', month: 'short' })
    .format(isoDateToUtcMs(isoDate))
    .replace('.', '');
}

/** Diferença em dias de calendário (a − b). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((isoDateToUtcMs(a) - isoDateToUtcMs(b)) / 86_400_000);
}

export function addDays(isoDate: ISODate, days: number): ISODate {
  return new Date(isoDateToUtcMs(isoDate) + days * 86_400_000).toISOString().slice(0, 10);
}

export function relativeDayLabel(isoDate: ISODate, today: ISODate): string {
  const diff = daysBetween(isoDate, today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff < 0) return `Há ${-diff} dias`;
  return `Em ${diff} dias`;
}

/** Formata minutos como "1 h 25 min", "45 min" ou "2 h". */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
