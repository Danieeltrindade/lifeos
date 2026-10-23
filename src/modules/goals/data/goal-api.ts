import { useQuery } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import { qk } from '@/services/data/queries';
import type { TablesUpdate } from '@/services/supabase/database.types';
import { must, mustList, mustSucceed, insertOnce } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';

/** Histórico (por ciclo), lançamentos manuais, marcos e alterações de uma meta. */
export function useGoalDetailQuery(goalId: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.goalDetail(goalId),
    queryFn: async ({ signal }) => {
      const [history, entries, milestones, changes] = await Promise.all([
        mustList(
          client
            .rpc('goal_history', {
              p_goal_id: goalId,
              p_cycles: 8,
              p_now: new Date().toISOString(),
            })
            .abortSignal(signal),
        ),
        mustList(
          client
            .from('goal_progress_entries')
            .select('*')
            .eq('goal_id', goalId)
            .order('recorded_on', { ascending: false })
            .abortSignal(signal),
        ),
        mustList(
          client
            .from('goal_milestones')
            .select('*')
            .eq('goal_id', goalId)
            .order('sort_order', { ascending: true })
            .abortSignal(signal),
        ),
        mustList(
          client
            .from('goal_changes')
            .select('*')
            .eq('goal_id', goalId)
            .order('changed_at', { ascending: false })
            .abortSignal(signal),
        ),
      ]);
      return { history, entries, milestones, changes };
    },
  });
}

export function useSaveGoal() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['goals'],
    success: 'Meta salva.',
    mutationFn: ({
      id,
      row,
    }: {
      id?: string;
      row: TablesUpdate<'goals'> & { title: string; target_value: number; unit: string };
    }) =>
      id
        ? must(client.from('goals').update(row).eq('id', id).select('*').single())
        : insertOnce(
            row.id,
            () => client.from('goals').insert(row).select('*').single(),
            () =>
              client
                .from('goals')
                .select('*')
                .eq('id', row.id ?? '')
                .maybeSingle(),
          ),
  });
}

export function useGoalStatus() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['goals'],
    success: 'Meta atualizada.',
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'goals'> }) =>
      mustSucceed(client.from('goals').update(patch).eq('id', id)),
  });
}

export function useDeleteGoal() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['goals'],
    success: 'Meta excluída.',
    mutationFn: (id: string) => mustSucceed(client.from('goals').delete().eq('id', id)),
  });
}

export function useGoalEntries() {
  const client = useSupabase();
  const add = useLifeosMutation({
    affects: ['goals'],
    success: 'Lançamento registrado.',
    mutationFn: (row: {
      id?: string;
      goal_id: string;
      amount: number;
      recorded_on: string;
      note: string;
    }) =>
      insertOnce(
        row.id,
        () => client.from('goal_progress_entries').insert(row).select('*').single(),
        () =>
          client
            .from('goal_progress_entries')
            .select('*')
            .eq('id', row.id ?? '')
            .maybeSingle(),
      ).then(() => undefined),
  });
  const remove = useLifeosMutation({
    affects: ['goals'],
    success: 'Lançamento removido.',
    mutationFn: (id: string) =>
      mustSucceed(client.from('goal_progress_entries').delete().eq('id', id)),
  });
  return { add, remove };
}

export function useGoalMilestones() {
  const client = useSupabase();
  const add = useLifeosMutation({
    affects: ['goals'],
    mutationFn: (row: {
      goal_id: string;
      title: string;
      target_value: number | null;
      due_on: string | null;
      sort_order: number;
    }) => mustSucceed(client.from('goal_milestones').insert(row)),
  });
  const toggle = useLifeosMutation({
    affects: ['goals'],
    mutationFn: ({ id, achieved }: { id: string; achieved: boolean }) =>
      mustSucceed(
        client
          .from('goal_milestones')
          .update({ achieved_at: achieved ? new Date().toISOString() : null })
          .eq('id', id),
      ),
  });
  const remove = useLifeosMutation({
    affects: ['goals'],
    mutationFn: (id: string) => mustSucceed(client.from('goal_milestones').delete().eq('id', id)),
  });
  return { add, toggle, remove };
}
