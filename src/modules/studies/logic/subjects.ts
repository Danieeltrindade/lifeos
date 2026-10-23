import type { Tables } from '@/services/supabase/database.types';
import { MASTERY_LABELS } from './reviews';

export type Subject = Tables<'subjects'>;
export type Topic = Tables<'topics'>;
export type MasteryEvent = Tables<'topic_mastery_events'>;

export const SUBJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  completed: 'Concluída',
};

export const DIFFICULTY_LABELS = ['', 'Muito fácil', 'Fácil', 'Média', 'Difícil', 'Muito difícil'];

/** Cores sugeridas (contraste verificado sobre fundo claro e escuro como marcador). */
export const SUBJECT_COLORS = [
  '#2b8070',
  '#2f63a8',
  '#8a4fb5',
  '#c0492f',
  '#c98419',
  '#3f8f3a',
  '#b83a7a',
  '#5d6b78',
];

/**
 * Domínio ATUAL de cada tópico = registro mais recente (manual, sessão ou revisão).
 * O histórico é preservado; nada é sobrescrito.
 */
export function latestMasteryByTopic(events: readonly MasteryEvent[]): Map<string, MasteryEvent> {
  const out = new Map<string, MasteryEvent>();
  for (const e of events) {
    const current = out.get(e.topic_id);
    if (!current || e.recorded_at > current.recorded_at) out.set(e.topic_id, e);
  }
  return out;
}

export function masteryLabel(level: number | null | undefined): string {
  if (level === null || level === undefined) return 'Sem registro';
  return MASTERY_LABELS[level] ?? 'Sem registro';
}

/** Tópicos em árvore de um nível: principais e seus subtópicos. */
export function topicTree(
  topics: readonly Topic[],
  subjectId: string,
): { topic: Topic; children: Topic[] }[] {
  const own = topics.filter((t) => t.subject_id === subjectId && t.archived_at === null);
  return own
    .filter((t) => t.parent_topic_id === null)
    .map((topic) => ({ topic, children: own.filter((c) => c.parent_topic_id === topic.id) }));
}

/** Distribuição de domínio dos tópicos de uma matéria (para o resumo da matéria). */
export function masteryDistribution(
  topicIds: readonly string[],
  latest: Map<string, MasteryEvent>,
): { level: number | null; count: number }[] {
  const counts = new Map<number | null, number>();
  for (const id of topicIds) {
    const level = latest.get(id)?.level ?? null;
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return [null, 0, 1, 2, 3, 4]
    .map((level) => ({ level, count: counts.get(level) ?? 0 }))
    .filter((x) => x.count > 0);
}
