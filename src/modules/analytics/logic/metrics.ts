/**
 * Funções de métrica PURAS (docs/metrics.md). Nenhuma delas divide por zero nem inventa
 * valor: quando a base é vazia ou zero, o resultado é `null` e a interface diz "sem base".
 */

/** Razão num/den; null quando den ≤ 0 ou algum valor não é finito. */
export function safeRate(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

export function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/** Média aritmética; null para lista vazia. */
export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

/** Mediana; null para lista vazia. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export type ChangeKind =
  /** Ambos zero: nada a comparar. */
  | 'none'
  /** Antes zero, agora > 0: variação percentual indefinida. */
  | 'new'
  | 'up'
  | 'down'
  | 'same';

export interface Change {
  current: number;
  previous: number;
  delta: number;
  /** Variação relativa; null quando o anterior é 0 (nunca "∞%" ou "+100%" inventado). */
  pct: number | null;
  kind: ChangeKind;
}

export function change(current: number, previous: number): Change {
  const delta = current - previous;
  if (previous === 0) {
    return { current, previous, delta, pct: null, kind: current === 0 ? 'none' : 'new' };
  }
  const pct = delta / Math.abs(previous);
  return {
    current,
    previous,
    delta,
    pct,
    kind: Math.abs(delta) < 1e-9 ? 'same' : delta > 0 ? 'up' : 'down',
  };
}

const pctFormat = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
  signDisplay: 'always',
});
const pctPlain = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const numFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Texto da variação sem depender de cor ("+20% (+30 min)", "sem base anterior"). */
export function describeChange(c: Change, formatDelta: (v: number) => string): string {
  switch (c.kind) {
    case 'none':
      return 'sem registros nos dois períodos';
    case 'new':
      return `sem base no período anterior (antes: 0; agora: ${formatDelta(c.current)})`;
    case 'same':
      return 'igual ao período anterior';
    default: {
      const sign = c.delta > 0 ? '+' : '−';
      return `${pctFormat.format((c.pct ?? 0) * 100)}% (${sign}${formatDelta(Math.abs(c.delta))})`;
    }
  }
}

/**
 * Variação de uma TAXA (consistência, % de acerto, ciclos atingidos) em pontos percentuais.
 * Variação relativa de taxas engana (40 % → 50 % seria "+25 %"), por isso aqui é a diferença
 * absoluta. Sem base em um dos períodos, diz isso em vez de inventar um número.
 */
export function describeRateChange(current: number | null, previous: number | null): string {
  if (current === null && previous === null) return 'sem base nos dois períodos';
  if (previous === null) return 'sem base no período anterior';
  if (current === null) return `sem base agora (antes: ${pctPlain.format(previous)})`;
  const pp = Math.round((current - previous) * 100);
  if (pp === 0) return `igual ao período anterior (${pctPlain.format(previous)})`;
  return `${pp > 0 ? '+' : '−'}${String(Math.abs(pp))} p.p. (antes: ${pctPlain.format(previous)})`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : pctPlain.format(rate);
}

export function formatNumber(value: number): string {
  return numFormat.format(value);
}

/** Segundos → "2 h 05 min", "45 min", "0 min". */
export function formatSeconds(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${String(m)} min`;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m).padStart(2, '0')} min`;
}

export function hours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Séries diárias
// ---------------------------------------------------------------------------

export interface DailyTotals {
  /** Soma no período. */
  total: number;
  /** Dias do período já transcorridos (base da média diária). */
  elapsedDays: number;
  /** Dias com valor > 0. */
  activeDays: number;
  /** Média por dia transcorrido (inclui dias sem registro); null sem dias. */
  perDay: number | null;
  /** Média por dia COM registro; null se nenhum dia teve registro. */
  perActiveDay: number | null;
}

/**
 * Totais de uma série diária. Dias FUTUROS (depois de `today`) não entram na média — um
 * período em andamento não é "punido" pelos dias que ainda não aconteceram.
 */
export function dailyTotals(
  days: readonly { date: string; value: number }[],
  today: string,
): DailyTotals {
  const elapsed = days.filter((d) => d.date <= today);
  const total = sum(elapsed.map((d) => d.value));
  const activeDays = elapsed.filter((d) => d.value > 0).length;
  return {
    total,
    elapsedDays: elapsed.length,
    activeDays,
    perDay: safeRate(total, elapsed.length),
    perActiveDay: safeRate(total, activeDays),
  };
}

// ---------------------------------------------------------------------------
// Estimado × realizado
// ---------------------------------------------------------------------------

export interface EstimatePair {
  taskId: string;
  estimateMinutes: number;
  actualSeconds: number;
}

export interface EstimateAccuracy {
  /** Tarefas concluídas com estimativa no período. */
  withEstimate: number;
  /** Destas, as que têm tempo registrado (> 0) — base da comparação. */
  withTime: number;
  /** Sem tempo registrado: não dá para comparar (não contam como "acertou"). */
  withoutTime: number;
  /** Mediana de realizado ÷ estimado (1 = como previsto); null sem base. */
  medianRatio: number | null;
  /** Fração das comparáveis dentro de ±25% da estimativa. */
  withinTolerance: number | null;
  totalEstimateMinutes: number;
  totalActualMinutes: number;
}

export const ESTIMATE_TOLERANCE = 0.25;

export function estimateAccuracy(pairs: readonly EstimatePair[]): EstimateAccuracy {
  const valid = pairs.filter((p) => p.estimateMinutes > 0);
  const comparable = valid.filter((p) => p.actualSeconds > 0);
  const ratios = comparable.map((p) => p.actualSeconds / 60 / p.estimateMinutes);
  const within = ratios.filter((r) => Math.abs(r - 1) <= ESTIMATE_TOLERANCE).length;
  return {
    withEstimate: valid.length,
    withTime: comparable.length,
    withoutTime: valid.length - comparable.length,
    medianRatio: median(ratios),
    withinTolerance: safeRate(within, comparable.length),
    totalEstimateMinutes: sum(comparable.map((p) => p.estimateMinutes)),
    totalActualMinutes: Math.round(sum(comparable.map((p) => p.actualSeconds)) / 60),
  };
}

// ---------------------------------------------------------------------------
// Tarefas com prazo no período
// ---------------------------------------------------------------------------

export interface DueBreakdown {
  total: number;
  cancelled: number;
  doneOnTime: number;
  doneLate: number;
  open: number;
  openOverdue: number;
}

/**
 * Taxa de cumprimento de prazo: concluídas no prazo ÷ (com prazo no período − canceladas
 * − abertas ainda não vencidas). Abertas que ainda podem ser feitas no prazo não contam
 * contra nem a favor. null quando a base é 0.
 */
export function onTimeRate(d: DueBreakdown): number | null {
  const openNotYetDue = d.open - d.openOverdue;
  return safeRate(d.doneOnTime, d.total - d.cancelled - openNotYetDue);
}
