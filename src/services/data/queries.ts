/**
 * Leituras compartilhadas entre módulos (TanStack Query). As chaves começam pelo DOMÍNIO
 * (lib/query/domains.ts), o que permite invalidar por domínio depois de uma escrita.
 *
 * Escala: o LifeOS é pessoal; as listas são lidas inteiras (com teto) e filtradas na
 * interface. Tabelas que crescem sem limite (atividades, sessões, marcações, eventos)
 * são lidas por JANELA de datas.
 */
import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@/services/supabase/database.types';
import { fetchAll, mustList } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';

export const qk = {
  tasks: ['tasks', 'all'] as const,
  taskDeps: ['tasks', 'deps'] as const,
  projects: ['projects', 'all'] as const,
  projectMilestones: (projectId: string) => ['projects', 'milestones', projectId] as const,
  projectHistory: (projectId: string) => ['projects', 'history', projectId] as const,
  subjects: ['subjects', 'all'] as const,
  topics: ['subjects', 'topics'] as const,
  mastery: ['subjects', 'mastery'] as const,
  reviewCards: ['reviews', 'cards'] as const,
  reviewDetail: (cardId: string) => ['reviews', 'detail', cardId] as const,
  activeSession: ['sessions', 'active'] as const,
  sessions: (from: string, to: string) => ['sessions', 'range', from, to] as const,
  reflections: ['sessions', 'reflections'] as const,
  categories: ['categories', 'all'] as const,
  goals: ['goals', 'all'] as const,
  goalProgress: ['goals', 'progress'] as const,
  goalDetail: (goalId: string) => ['goals', 'detail', goalId] as const,
  habits: ['habits', 'all'] as const,
  checkins: (from: string) => ['habits', 'checkins', from] as const,
  activities: (from: string, to: string) => ['activities', 'range', from, to] as const,
  diary: ['diary', 'all'] as const,
  calendar: (from: string, to: string) => ['calendar', 'range', from, to] as const,
  dashboard: ['dashboard'] as const,
};

export type Task = Tables<'tasks'>;
export type Project = Tables<'projects'>;
export type Subject = Tables<'subjects'>;
export type Topic = Tables<'topics'>;
export type Category = Tables<'activity_categories'>;

export function useTasksQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.tasks,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useTaskDependenciesQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.taskDeps,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('task_dependencies')
          .select('*')
          .order('task_id', { ascending: true })
          .order('depends_on_task_id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useProjectsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.projects,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('projects')
          .select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useSubjectsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.subjects,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('subjects')
          .select('*')
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useTopicsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.topics,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('topics')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

/** Histórico de domínio (todos os tópicos), mais recente primeiro. */
export function useMasteryQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.mastery,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('topic_mastery_events')
          .select('*')
          .order('recorded_at', { ascending: false })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useReviewCardsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.reviewCards,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('review_cards')
          .select('*')
          .order('due_on', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useCategoriesQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.categories,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('activity_categories')
          .select('*')
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useHabitsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.habits,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('habits')
          .select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

/** Marcações a partir de uma data (inclusive). */
export function useCheckinsQuery(from: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.checkins(from),
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('habit_checkins')
          .select('*')
          .gte('local_date', from)
          .order('local_date', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

/** Atividades que INTERSECTAM [from, to) (instantes ISO). */
export function useActivitiesQuery(from: string, to: string, enabled = true) {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.activities(from, to),
    enabled,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('activities')
          .select('*')
          .lt('started_at', to)
          .gt('ended_at', from)
          .order('started_at', { ascending: false })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useGoalsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.goals,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('goals')
          .select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useGoalProgressQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.goalProgress,
    queryFn: ({ signal }) =>
      mustList(
        client.rpc('goal_progress', { p_now: new Date().toISOString() }).abortSignal(signal),
      ),
  });
}

/** Mapa id → item, útil para nomes em listas. */
export function indexById<T extends { id: string }>(
  items: readonly T[] | undefined,
): Map<string, T> {
  return new Map((items ?? []).map((i) => [i.id, i]));
}
