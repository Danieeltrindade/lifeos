import { useQuery } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import { qk } from '@/services/data/queries';
import type { TablesInsert, TablesUpdate } from '@/services/supabase/database.types';
import { must, mustList, mustSucceed, insertOnce } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';

export function useMilestonesQuery(projectId: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.projectMilestones(projectId),
    queryFn: ({ signal }) =>
      mustList(
        client
          .from('project_milestones')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
          .abortSignal(signal),
      ),
  });
}

export function useProjectHistoryQuery(projectId: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.projectHistory(projectId),
    queryFn: ({ signal }) =>
      mustList(
        client
          .from('project_status_history')
          .select('*')
          .eq('project_id', projectId)
          .order('changed_at', { ascending: false })
          .abortSignal(signal),
      ),
  });
}

export type ProjectInput = Omit<TablesInsert<'projects'>, 'user_id'>;

export function useCreateProject() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['projects'],
    success: 'Projeto criado.',
    mutationFn: (input: ProjectInput) =>
      insertOnce(
        input.id,
        () => client.from('projects').insert(input).select('*').single(),
        () =>
          client
            .from('projects')
            .select('*')
            .eq('id', input.id ?? '')
            .maybeSingle(),
      ),
  });
}

export function useUpdateProject(success = 'Projeto salvo.') {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['projects'],
    success,
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'projects'> }) =>
      must(client.from('projects').update(patch).eq('id', id).select('*').single()),
  });
}

export function useDeleteProject() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['projects', 'tasks'],
    success: 'Projeto excluído.',
    mutationFn: (id: string) => mustSucceed(client.from('projects').delete().eq('id', id)),
  });
}

export function useCreateMilestone() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['projects'],
    success: 'Marco adicionado.',
    mutationFn: (input: {
      project_id: string;
      title: string;
      due_on: string | null;
      sort_order: number;
    }) => mustSucceed(client.from('project_milestones').insert(input)),
  });
}

export function useUpdateMilestone() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['projects'],
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'project_milestones'> }) =>
      mustSucceed(client.from('project_milestones').update(patch).eq('id', id)),
  });
}

export function useDeleteMilestone() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['projects'],
    success: 'Marco excluído.',
    mutationFn: (id: string) =>
      mustSucceed(client.from('project_milestones').delete().eq('id', id)),
  });
}
