import { useLifeosMutation } from '@/lib/query/mutations';
import type { TablesUpdate } from '@/services/supabase/database.types';
import { must, mustSucceed, insertOnce } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import type { Activity } from '../logic/activities';

export function useSaveActivity() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['activities'],
    success: 'Atividade salva.',
    mutationFn: ({
      id,
      row,
    }: {
      id?: string;
      row: TablesUpdate<'activities'> & { title: string; started_at: string; ended_at: string };
    }) =>
      id
        ? must(client.from('activities').update(row).eq('id', id).select('*').single())
        : insertOnce(
            row.id,
            () => client.from('activities').insert(row).select('*').single(),
            () =>
              client
                .from('activities')
                .select('*')
                .eq('id', row.id ?? '')
                .maybeSingle(),
          ),
  });
}

/**
 * Excluir: atividade manual sai sozinha; atividade do cronômetro é excluída junto com a
 * sessão que a gerou (senão a sessão continuaria encerrada e sem registro de tempo).
 */
export function useDeleteActivity() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['activities', 'sessions'],
    success: 'Atividade excluída.',
    mutationFn: (activity: Activity) =>
      activity.session_id
        ? mustSucceed(client.from('focus_sessions').delete().eq('id', activity.session_id))
        : mustSucceed(client.from('activities').delete().eq('id', activity.id)),
  });
}

export function useSaveCategory() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['categories'],
    success: 'Categoria salva.',
    mutationFn: ({
      id,
      row,
    }: {
      id?: string;
      row: { name: string; color?: string | null; archived_at?: string | null };
    }) =>
      id
        ? mustSucceed(client.from('activity_categories').update(row).eq('id', id))
        : mustSucceed(client.from('activity_categories').insert(row)),
  });
}
