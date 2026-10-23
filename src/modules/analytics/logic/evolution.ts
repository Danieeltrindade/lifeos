/**
 * Séries de evolução temporal (gráficos "por dia / semana / mês").
 *
 * Regras (docs/metrics.md §2):
 *  - granularidade pelo tamanho do período: até 62 dias → dia; até 186 → semana; acima → mês;
 *  - dias que ainda não aconteceram NÃO entram: não viram barra de valor 0 (ausência ≠ zero);
 *  - um balde (semana ou mês) é PARCIAL quando cobre menos dias que um balde completo — por
 *    estar na borda do período ou por ainda estar em andamento. Parciais são sinalizados para
 *    que uma barra menor não seja lida como queda de desempenho.
 *
 * Funções puras, sem React; testadas em evolution.test.ts.
 */
import { startOfWeek } from '@/lib/zoned';

export type Granularity = 'day' | 'week' | 'month';

export const GRANULARITY_LABELS: Record<Granularity, { title: string; column: string }> = {
  day: { title: 'por dia', column: 'Dia' },
  week: { title: 'por semana', column: 'Semana' },
  month: { title: 'por mês', column: 'Mês' },
};

export function granularityFor(periodDays: number): Granularity {
  if (periodDays <= 62) return 'day';
  if (periodDays <= 186) return 'week';
  return 'month';
}

function daysInMonth(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function bucketKey(date: string, g: Granularity, weekStartsOn: number): string {
  if (g === 'day') return date;
  if (g === 'week') return startOfWeek(date, weekStartsOn);
  return `${date.slice(0, 7)}-01`;
}

function fullLength(key: string, g: Granularity): number {
  if (g === 'day') return 1;
  if (g === 'week') return 7;
  return daysInMonth(key);
}

export interface EvolutionBucket<K extends string> {
  /** Primeiro dia do balde (dia, início da semana do perfil ou dia 1 do mês). */
  key: string;
  /** Primeiro e último dia do balde DENTRO do período e já transcorridos. */
  firstDay: string;
  lastDay: string;
  /** Dias observados (dentro do período e até hoje). */
  observedDays: number;
  /** Dias de um balde completo (1, 7 ou dias do mês). */
  fullDays: number;
  partial: boolean;
  values: Record<K, number>;
}

/**
 * Agrupa uma série diária (uma linha por dia do período, como devolvida pelas funções
 * stats_* do banco) em baldes, somando cada métrica.
 */
export function evolutionBuckets<T extends { date: string }, K extends string>(
  days: readonly T[],
  opts: { granularity: Granularity; today: string; weekStartsOn: number },
  metrics: Record<K, (d: T) => number>,
): EvolutionBucket<K>[] {
  const keys = Object.keys(metrics) as K[];
  const out = new Map<string, EvolutionBucket<K>>();
  for (const d of days) {
    if (d.date > opts.today) continue; // futuro: sem dado, não é zero
    const key = bucketKey(d.date, opts.granularity, opts.weekStartsOn);
    let b = out.get(key);
    if (!b) {
      b = {
        key,
        firstDay: d.date,
        lastDay: d.date,
        observedDays: 0,
        fullDays: fullLength(key, opts.granularity),
        partial: false,
        values: Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>,
      };
      out.set(key, b);
    }
    b.observedDays += 1;
    if (d.date < b.firstDay) b.firstDay = d.date;
    if (d.date > b.lastDay) b.lastDay = d.date;
    for (const k of keys) b.values[k] += metrics[k](d);
  }
  const buckets = [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const b of buckets) b.partial = b.observedDays < b.fullDays;
  return buckets;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function ddmm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Rótulo curto do eixo; baldes parciais ganham "*". */
export function bucketLabel(b: EvolutionBucket<string>, g: Granularity): string {
  const mark = b.partial ? '*' : '';
  if (g === 'day') return ddmm(b.key);
  if (g === 'week') return `${ddmm(b.key)}${mark}`;
  const m = MONTHS[Number(b.key.slice(5, 7)) - 1] ?? b.key.slice(5, 7);
  return `${m}/${b.key.slice(2, 4)}${mark}`;
}

/** Descrição completa para a tabela de dados (inclui a cobertura dos parciais). */
export function bucketDescription(b: EvolutionBucket<string>, g: Granularity): string {
  if (g === 'day') return ddmm(b.key);
  const base = g === 'week' ? `Semana de ${ddmm(b.key)}` : bucketLabel({ ...b, partial: false }, g);
  if (!b.partial) return base;
  return `${base} (parcial: ${ddmm(b.firstDay)}–${ddmm(b.lastDay)}, ${String(b.observedDays)} de ${String(b.fullDays)} dias)`;
}

/** Nota explicativa para o cartão do gráfico, ou null quando não há nada a avisar. */
export function evolutionNote(
  buckets: readonly EvolutionBucket<string>[],
  g: Granularity,
  periodLastDay: string,
  today: string,
): string | null {
  const notes: string[] = [];
  if (g !== 'day' && buckets.some((b) => b.partial)) {
    notes.push(
      `* ${g === 'week' ? 'semana' : 'mês'} parcial: cobre só os dias dentro do período e já transcorridos — compare com cuidado.`,
    );
  }
  if (periodLastDay > today) {
    notes.push(`Dias depois de hoje (${ddmm(today)}) ainda não aconteceram e não aparecem.`);
  }
  return notes.length > 0 ? notes.join(' ') : null;
}
