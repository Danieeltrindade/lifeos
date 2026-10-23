/**
 * Períodos de análise e o período ANTERIOR EQUIVALENTE (docs/metrics.md §2).
 *
 * Todo período é um intervalo de DATAS LOCAIS [from, to) no fuso do perfil — o banco
 * converte para instantes com o mesmo fuso (public.stats_*), então "dia" é sempre o dia
 * do usuário, inclusive para sessões que cruzam a meia-noite.
 */
import { addDays, daysBetween, type ISODate } from '@/lib/date';
import { addMonths, startOfMonth, startOfWeek } from '@/lib/zoned';

export type PeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export const PERIOD_KIND_LABELS: Record<PeriodKind, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
  quarter: 'Trimestre',
  year: 'Ano',
  custom: 'Personalizado',
};

/** Limite do banco (private.require_stats_range): 731 dias. */
export const MAX_PERIOD_DAYS = 731;

export interface Period {
  kind: PeriodKind;
  /** Primeiro dia (inclusive). */
  from: ISODate;
  /** Dia seguinte ao último (exclusive). */
  to: ISODate;
}

export function periodDays(p: Pick<Period, 'from' | 'to'>): number {
  return daysBetween(p.to, p.from);
}

function startOfQuarter(date: ISODate): ISODate {
  const month = Number(date.slice(5, 7));
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${String(first).padStart(2, '0')}-01`;
}

/**
 * Período do tipo pedido que CONTÉM `anchor`. Para "custom", usa [customFrom, customTo]
 * (último dia inclusive), corrigindo a ordem e limitando a MAX_PERIOD_DAYS.
 */
export function resolvePeriod(
  kind: PeriodKind,
  anchor: ISODate,
  weekStartsOn: number,
  custom?: { from: ISODate; toInclusive: ISODate },
): Period {
  switch (kind) {
    case 'day':
      return { kind, from: anchor, to: addDays(anchor, 1) };
    case 'week': {
      const from = startOfWeek(anchor, weekStartsOn);
      return { kind, from, to: addDays(from, 7) };
    }
    case 'month': {
      const from = startOfMonth(anchor);
      return { kind, from, to: addMonths(from, 1) };
    }
    case 'quarter': {
      const from = startOfQuarter(anchor);
      return { kind, from, to: addMonths(from, 3) };
    }
    case 'year': {
      const from = `${anchor.slice(0, 4)}-01-01`;
      return { kind, from, to: addMonths(from, 12) };
    }
    case 'custom': {
      let a = custom?.from ?? anchor;
      let b = custom?.toInclusive ?? anchor;
      if (b < a) [a, b] = [b, a];
      let to = addDays(b, 1);
      if (daysBetween(to, a) > MAX_PERIOD_DAYS) to = addDays(a, MAX_PERIOD_DAYS);
      return { kind, from: a, to };
    }
  }
}

/**
 * Período anterior EQUIVALENTE: o dia/semana/mês/trimestre/ano de calendário anterior
 * (um mês tem a duração do mês anterior, não "30 dias"); para "custom", o intervalo de
 * mesma duração imediatamente antes.
 */
export function previousPeriod(p: Period): Period {
  switch (p.kind) {
    case 'day':
      return { kind: p.kind, from: addDays(p.from, -1), to: p.from };
    case 'week':
      return { kind: p.kind, from: addDays(p.from, -7), to: p.from };
    case 'month':
      return { kind: p.kind, from: addMonths(p.from, -1), to: p.from };
    case 'quarter':
      return { kind: p.kind, from: addMonths(p.from, -3), to: p.from };
    case 'year':
      return { kind: p.kind, from: addMonths(p.from, -12), to: p.from };
    case 'custom':
      return { kind: p.kind, from: addDays(p.from, -periodDays(p)), to: p.from };
  }
}

/** Período seguinte (para navegação). */
export function nextPeriod(p: Period, weekStartsOn: number): Period {
  if (p.kind === 'custom') {
    return { kind: p.kind, from: p.to, to: addDays(p.to, periodDays(p)) };
  }
  return resolvePeriod(p.kind, p.to, weekStartsOn);
}

export type PeriodState = 'past' | 'current' | 'future';

export interface PeriodProgress {
  state: PeriodState;
  /** Dias já transcorridos (hoje conta como transcorrido, ainda em andamento). */
  elapsedDays: number;
  totalDays: number;
  /** O período ainda não terminou: totais podem crescer. */
  incomplete: boolean;
}

export function periodProgress(p: Period, today: ISODate): PeriodProgress {
  const totalDays = periodDays(p);
  if (today < p.from) return { state: 'future', elapsedDays: 0, totalDays, incomplete: true };
  if (today >= p.to) return { state: 'past', elapsedDays: totalDays, totalDays, incomplete: false };
  return {
    state: 'current',
    elapsedDays: daysBetween(today, p.from) + 1,
    totalDays,
    incomplete: true,
  };
}

export interface Comparison {
  current: Period;
  /** Intervalo do período anterior efetivamente comparado. */
  previous: Pick<Period, 'from' | 'to'>;
  /**
   * true quando o período atual está em andamento e a comparação usa só os primeiros
   * N dias do anterior ("até o mesmo ponto"), evitando comparar um mês pela metade com
   * um mês inteiro.
   */
  aligned: boolean;
  elapsedDays: number;
}

export function comparisonFor(current: Period, today: ISODate): Comparison | null {
  const progress = periodProgress(current, today);
  if (progress.state === 'future') return null;
  const prev = previousPeriod(current);
  if (progress.state === 'past') {
    return { current, previous: prev, aligned: false, elapsedDays: progress.totalDays };
  }
  const prevDays = periodDays(prev);
  const days = Math.min(progress.elapsedDays, prevDays);
  return {
    current,
    previous: { from: prev.from, to: addDays(prev.from, days) },
    aligned: true,
    elapsedDays: progress.elapsedDays,
  };
}

const monthNames = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function br(date: ISODate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** Rótulo legível do período ("semana de 19/10/2026 a 25/10/2026", "outubro de 2026"). */
export function periodLabel(p: Period): string {
  const last = addDays(p.to, -1);
  switch (p.kind) {
    case 'day':
      return br(p.from);
    case 'month':
      return `${monthNames[Number(p.from.slice(5, 7)) - 1] ?? ''} de ${p.from.slice(0, 4)}`;
    case 'quarter':
      return `${String(Math.floor((Number(p.from.slice(5, 7)) - 1) / 3) + 1)}º trimestre de ${p.from.slice(0, 4)}`;
    case 'year':
      return p.from.slice(0, 4);
    default:
      return `${br(p.from)} a ${br(last)}`;
  }
}

/** Período a partir dos parâmetros da URL (filtro persistente e compartilhável). */
export function periodFromParams(
  params: URLSearchParams,
  today: ISODate,
  weekStartsOn: number,
): Period {
  const raw = params.get('periodo');
  const kind: PeriodKind =
    raw === 'day' ||
    raw === 'week' ||
    raw === 'month' ||
    raw === 'quarter' ||
    raw === 'year' ||
    raw === 'custom'
      ? raw
      : 'week';
  const valid = (v: string | null): v is ISODate =>
    v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const anchorParam = params.get('data');
  const anchor = valid(anchorParam) ? anchorParam : today;
  if (kind === 'custom') {
    const de = params.get('de');
    const ate = params.get('ate');
    if (valid(de) && valid(ate)) {
      return resolvePeriod('custom', anchor, weekStartsOn, { from: de, toInclusive: ate });
    }
    return resolvePeriod('custom', anchor, weekStartsOn, {
      from: addDays(today, -29),
      toInclusive: today,
    });
  }
  return resolvePeriod(kind, anchor, weekStartsOn);
}

export function periodToParams(p: Period, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set('periodo', p.kind);
  if (p.kind === 'custom') {
    next.delete('data');
    next.set('de', p.from);
    next.set('ate', addDays(p.to, -1));
  } else {
    next.set('data', p.from);
    next.delete('de');
    next.delete('ate');
  }
  return next;
}
