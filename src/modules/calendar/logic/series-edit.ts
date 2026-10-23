/**
 * Edição de "esta e as seguintes" ocorrências: a série é DIVIDIDA em duas (ADR-033).
 *
 *  - a série original passa a terminar antes da ocorrência escolhida (UNTIL no dia anterior,
 *    ou COUNT = quantas já ocorreram, se a série terminava por contagem);
 *  - uma série NOVA começa na ocorrência escolhida, com as alterações, herdando o fim
 *    original (a mesma data final, ou as repetições restantes).
 *
 * Assim o passado não muda (o histórico de planejamento continua como era) e nenhuma
 * ocorrência é duplicada ou perdida. Se a ocorrência escolhida é a primeira, não há o que
 * dividir: editar "esta e as seguintes" é editar a série inteira.
 */
import { addDays, type ISODate } from '@/lib/date';
import { isoDateFromParts, zonedParts } from '@/lib/zoned';
import { formatRule, occurrenceDates, parseRule, type RecurrenceRule } from './recurrence';

export interface SeriesLike {
  allDay: boolean;
  startsAt: string | null;
  startDate: ISODate | null;
  timezone: string;
  recurrenceRule: string | null;
}

export type SplitPlan =
  | { kind: 'whole' }
  | { kind: 'invalid'; reason: string }
  | {
      kind: 'split';
      /** Data local da ocorrência escolhida (primeira da nova série). */
      splitDate: ISODate;
      /** Nova regra da série ORIGINAL (termina antes da ocorrência). */
      oldRule: string;
      /** Regra da NOVA série (null = a nova série teria 0 ocorrências). */
      newRule: string;
      /** Ocorrências que ficam na série original. */
      keptOccurrences: number;
    };

/** Data local (no fuso do evento) da ocorrência identificada pela chave. */
export function occurrenceDate(series: SeriesLike, occurrenceKey: string): ISODate {
  if (series.allDay) return occurrenceKey.slice(0, 10);
  return isoDateFromParts(zonedParts(new Date(occurrenceKey), series.timezone));
}

export function seriesFirstDate(series: SeriesLike): ISODate | null {
  if (series.allDay) return series.startDate;
  if (!series.startsAt) return null;
  return isoDateFromParts(zonedParts(new Date(series.startsAt), series.timezone));
}

export function planSplit(series: SeriesLike, occurrenceKey: string): SplitPlan {
  const rule = parseRule(series.recurrenceRule);
  if (!rule)
    return { kind: 'invalid', reason: 'O evento não se repete ou a regra não é suportada.' };
  const first = seriesFirstDate(series);
  if (!first) return { kind: 'invalid', reason: 'Evento sem início.' };
  const splitDate = occurrenceDate(series, occurrenceKey);
  if (splitDate <= first) return { kind: 'whole' };

  const before = occurrenceDates(rule, first, splitDate).length;
  if (before === 0) return { kind: 'whole' };

  const oldRule: RecurrenceRule =
    rule.count !== null
      ? { ...rule, count: before, until: null }
      : { ...rule, until: addDays(splitDate, -1) };
  const newRule: RecurrenceRule =
    rule.count !== null ? { ...rule, count: Math.max(1, rule.count - before) } : { ...rule };
  if (rule.count !== null && rule.count - before <= 0) {
    return { kind: 'invalid', reason: 'Essa ocorrência não faz parte da série.' };
  }
  return {
    kind: 'split',
    splitDate,
    oldRule: formatRule(oldRule),
    newRule: formatRule(newRule),
    keptOccurrences: before,
  };
}

/**
 * "Excluir esta e as seguintes": a série original termina antes da ocorrência. Se for a
 * primeira, a série inteira deve ser excluída (devolve null).
 */
export function truncateRule(series: SeriesLike, occurrenceKey: string): string | null {
  const plan = planSplit(series, occurrenceKey);
  return plan.kind === 'split' ? plan.oldRule : null;
}
