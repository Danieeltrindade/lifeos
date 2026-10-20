/**
 * Utilitários de data/hora em pt-BR.
 * Datas são armazenadas em UTC (ISO 8601) e exibidas no fuso do usuário. Ver docs/data-model.md.
 */
const LOCALE = 'pt-BR';

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function formatLongDate(date: Date): string {
  const text = new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short' })
    .format(new Date(iso))
    .replace('.', '');
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

/** Diferença em dias de calendário locais (a - b). */
export function calendarDaysBetween(a: Date, b: Date): number {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startA - startB) / 86_400_000);
}

export function relativeDayLabel(iso: string, now: Date): string {
  const diff = calendarDaysBetween(new Date(iso), now);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff < 0) return `Há ${-diff} dias`;
  return `Em ${diff} dias`;
}
