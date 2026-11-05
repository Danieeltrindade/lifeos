import { change, describeChange } from '../logic/metrics';
import type { TrendDirection } from './charts';

export function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Comparação textual (ou null quando não há período anterior para comparar). */
export function compareText(
  current: number,
  previous: number | undefined,
  format: (v: number) => string,
): string | null {
  if (previous === undefined) return null;
  return describeChange(change(current, previous), format);
}

/** Rótulo curto de eixo para minutos: "45m", "1h30", "3h". */
export function axisMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${String(m)}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${String(h)}h` : `${String(h)}h${String(r).padStart(2, '0')}`;
}

/** Direção da variação (para a seta); null sem período anterior ou sem base. */
export function compareDirection(current: number, previous: number | undefined): TrendDirection {
  if (previous === undefined) return null;
  const c = change(current, previous);
  return c.kind === 'up' || c.kind === 'down' || c.kind === 'same' ? c.kind : null;
}
