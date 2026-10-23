import { change, describeChange } from '../logic/metrics';

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
