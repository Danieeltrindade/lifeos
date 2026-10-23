import { useQuery } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import type { Tables } from '@/services/supabase/database.types';
import { mustList, mustSucceed } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import { toAppError } from '@/services/supabase/errors';
import {
  DEFAULT_PREFERENCES,
  type PlanningPreferences,
  type PreferredPeriod,
} from '../logic/planner';

export type AvailabilityWindowRow = Tables<'availability_windows'>;

export const planningKeys = {
  windows: ['planning', 'windows'] as const,
  preferences: ['planning', 'preferences'] as const,
};

export function useAvailabilityQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: planningKeys.windows,
    queryFn: ({ signal }) =>
      mustList(
        client
          .from('availability_windows')
          .select('*')
          .order('weekday', { ascending: true })
          .order('start_time', { ascending: true })
          .abortSignal(signal),
      ),
  });
}

/** Preferências salvas, ou os padrões quando o usuário ainda não salvou nenhuma. */
export function usePreferencesQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: planningKeys.preferences,
    queryFn: async ({ signal }): Promise<PlanningPreferences & { saved: boolean }> => {
      const { data, error } = await client
        .from('planning_preferences')
        .select('*')
        .limit(1)
        .abortSignal(signal);
      if (error) throw toAppError(error);
      const row = data[0];
      if (!row) return { ...DEFAULT_PREFERENCES, saved: false };
      return {
        breakMinutes: row.break_minutes,
        minBlockMinutes: row.min_block_minutes,
        maxBlockMinutes: row.max_block_minutes,
        preferredPeriod: row.preferred_period as PreferredPeriod,
        dailyLoadLimitMinutes: row.daily_load_limit_minutes,
        saved: true,
      };
    },
  });
}

export function useSavePreferences() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['planning'],
    success: 'Preferências de planejamento salvas.',
    mutationFn: (p: PlanningPreferences) =>
      mustSucceed(
        client.from('planning_preferences').upsert(
          {
            break_minutes: p.breakMinutes,
            min_block_minutes: p.minBlockMinutes,
            max_block_minutes: p.maxBlockMinutes,
            preferred_period: p.preferredPeriod,
            daily_load_limit_minutes: p.dailyLoadLimitMinutes,
          },
          { onConflict: 'user_id' },
        ),
      ),
  });
}

export function useAvailabilityMutations() {
  const client = useSupabase();
  const add = useLifeosMutation({
    affects: ['planning'],
    success: 'Janela adicionada.',
    mutationFn: (w: { weekday: number; start_time: string; end_time: string }) =>
      mustSucceed(client.from('availability_windows').insert(w)),
  });
  const remove = useLifeosMutation({
    affects: ['planning'],
    success: 'Janela removida.',
    mutationFn: (id: string) =>
      mustSucceed(client.from('availability_windows').delete().eq('id', id)),
  });
  return { add, remove };
}
