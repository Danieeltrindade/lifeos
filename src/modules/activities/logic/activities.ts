/**
 * Atividades: o que REALMENTE aconteceu (RN-02). Cada tipo tem métricas próprias, e o
 * banco recusa métricas fora do tipo (ex.: páginas só em leitura).
 */
import type { Tables } from '@/services/supabase/database.types';

export type Activity = Tables<'activities'>;
export type ActivityKind =
  'study' | 'reading' | 'exercise' | 'project' | 'work' | 'leisure' | 'other';

export const KIND_LABELS: Record<ActivityKind, string> = {
  study: 'Estudo',
  reading: 'Leitura',
  exercise: 'Exercício',
  project: 'Projeto',
  work: 'Trabalho',
  leisure: 'Lazer',
  other: 'Outra',
};

export const INTENSITY_LABELS = ['', 'Muito leve', 'Leve', 'Moderada', 'Intensa', 'Máxima'];

export function isKind(value: string): value is ActivityKind {
  return value in KIND_LABELS;
}

export interface KindTotal {
  kind: ActivityKind;
  seconds: number;
  count: number;
}

export function totalsByKind(activities: readonly Activity[]): KindTotal[] {
  const map = new Map<ActivityKind, KindTotal>();
  for (const a of activities) {
    const kind = isKind(a.kind) ? a.kind : 'other';
    const t = map.get(kind) ?? { kind, seconds: 0, count: 0 };
    t.seconds += a.duration_seconds;
    t.count += 1;
    map.set(kind, t);
  }
  return [...map.values()].sort((a, b) => b.seconds - a.seconds);
}

type GoalSource = Pick<
  Tables<'goals'>,
  | 'id'
  | 'title'
  | 'progress_mode'
  | 'subject_id'
  | 'project_id'
  | 'activity_category_id'
  | 'activity_kind'
  | 'status'
  | 'archived_at'
>;

/**
 * Metas ativas que contam esta atividade (mesmas regras de private.goal_value):
 * tempo de atividade filtrado por matéria/categoria/tipo/projeto e páginas de leitura.
 */
export function goalsCountingActivity(
  goals: readonly GoalSource[],
  activity: Pick<
    Activity,
    'kind' | 'subject_id' | 'category_id' | 'project_id' | 'task_id' | 'pages'
  >,
  taskProjectId: string | null,
): GoalSource[] {
  return goals.filter((g) => {
    if (g.status !== 'active' || g.archived_at !== null) return false;
    if (g.progress_mode === 'pages')
      return activity.kind === 'reading' && (activity.pages ?? 0) > 0;
    if (g.progress_mode !== 'activity_time') return false;
    if (g.subject_id && activity.subject_id !== g.subject_id) return false;
    if (g.activity_category_id && activity.category_id !== g.activity_category_id) return false;
    if (g.activity_kind && activity.kind !== g.activity_kind) return false;
    if (g.project_id && activity.project_id !== g.project_id && taskProjectId !== g.project_id)
      return false;
    return true;
  });
}
