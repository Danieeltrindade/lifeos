import type { Topic } from './subjects';

/** Seleção de matéria → tópico (tópicos filtrados pela matéria, subtópicos indentados). */
export function topicOptions(topics: readonly Topic[], subjectId: string) {
  const own = topics.filter((t) => t.subject_id === subjectId && t.archived_at === null);
  return own
    .filter((t) => t.parent_topic_id === null)
    .flatMap((t) => [
      { value: t.id, label: t.name },
      ...own
        .filter((c) => c.parent_topic_id === t.id)
        .map((c) => ({ value: c.id, label: `— ${c.name}` })),
    ]);
}
