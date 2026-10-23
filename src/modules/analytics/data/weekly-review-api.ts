import { useQuery } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import type { Tables } from '@/services/supabase/database.types';
import { mustList, mustSucceed } from '@/services/supabase/result';
import { toAppError } from '@/services/supabase/errors';
import { useSupabase } from '@/services/supabase/supabase-context';

export type WeeklyReview = Tables<'weekly_reviews'>;
export type WeeklyPriority = Tables<'weekly_review_priorities'>;

export const weeklyKeys = {
  list: ['weeklyReviews', 'list'] as const,
  detail: (weekStart: string) => ['weeklyReviews', 'detail', weekStart] as const,
};

/** Semanas já revisadas (para a regra de revisão semanal e a lista de histórico). */
export function useWeeklyReviewsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: weeklyKeys.list,
    queryFn: ({ signal }) =>
      mustList(
        client
          .from('weekly_reviews')
          .select('id, week_start, updated_at')
          .order('week_start', { ascending: false })
          .limit(104)
          .abortSignal(signal),
      ),
  });
}

export function useWeeklyReviewQuery(weekStart: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: weeklyKeys.detail(weekStart),
    queryFn: async ({ signal }) => {
      const { data, error } = await client
        .from('weekly_reviews')
        .select('*')
        .eq('week_start', weekStart)
        .limit(1)
        .abortSignal(signal);
      if (error) throw toAppError(error);
      const review = data[0] ?? null;
      const priorities = review
        ? await mustList(
            client
              .from('weekly_review_priorities')
              .select('*')
              .eq('review_id', review.id)
              .order('position', { ascending: true })
              .abortSignal(signal),
          )
        : [];
      return { review, priorities };
    },
  });
}

export interface WeeklyReviewInput {
  weekStart: string;
  notes: string;
  priorities: { title: string; taskId: string | null }[];
}

/**
 * Salva anotações e prioridades da semana. Prioridades são substituídas pela lista atual
 * (ordem = posição). Nada em tarefas ou agenda é alterado.
 */
export function useSaveWeeklyReview() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['weeklyReviews', 'recommendations'],
    success: 'Revisão semanal salva.',
    mutationFn: async (input: WeeklyReviewInput) => {
      const { data, error } = await client
        .from('weekly_reviews')
        .upsert(
          { week_start: input.weekStart, notes: input.notes },
          { onConflict: 'user_id,week_start' },
        )
        .select('id')
        .single();
      if (error) throw toAppError(error);
      await mustSucceed(client.from('weekly_review_priorities').delete().eq('review_id', data.id));
      if (input.priorities.length > 0) {
        await mustSucceed(
          client.from('weekly_review_priorities').insert(
            input.priorities.map((p, position) => ({
              review_id: data.id,
              position,
              title: p.title,
              task_id: p.taskId,
            })),
          ),
        );
      }
    },
  });
}
