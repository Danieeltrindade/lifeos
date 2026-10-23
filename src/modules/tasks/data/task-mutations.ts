import { useQueryClient } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import { qk, type Task } from '@/services/data/queries';
import type { TablesInsert, TablesUpdate } from '@/services/supabase/database.types';
import { must, mustSucceed, insertOnce } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import type { TaskStatus } from '../logic/tasks';

export type TaskInput = Omit<TablesInsert<'tasks'>, 'user_id' | 'status'> & {
  status?: TaskStatus;
};

export function useCreateTask() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['tasks'],
    success: 'Tarefa criada.',
    mutationFn: (input: TaskInput) =>
      insertOnce(
        input.id,
        () => client.from('tasks').insert(input).select('*').single(),
        () =>
          client
            .from('tasks')
            .select('*')
            .eq('id', input.id ?? '')
            .maybeSingle(),
      ),
  });
}

export function useUpdateTask() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['tasks'],
    success: 'Tarefa salva.',
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'tasks'> }) =>
      must(client.from('tasks').update(patch).eq('id', id).select('*').single()),
  });
}

/**
 * Muda o status. Concluir passa por public.complete_task (o banco aplica as regras de
 * dependência e subtarefas). Atualização OTIMISTA (o quadro Kanban move na hora) com
 * desfazer automático: em caso de erro, o cache volta ao estado anterior e a lista é
 * recarregada do banco.
 */
export function useChangeTaskStatus() {
  const client = useSupabase();
  const queryClient = useQueryClient();
  return useLifeosMutation<
    Task,
    { task: Task; status: TaskStatus; includeSubtasks?: boolean },
    { previous: Task[] | undefined }
  >({
    affects: ['tasks'],
    success: (_data, { status }) =>
      ({
        done: 'Tarefa concluída.',
        cancelled: 'Tarefa cancelada.',
        todo: 'Tarefa reaberta.',
        in_progress: 'Tarefa em andamento.',
      })[status],
    onMutate: async ({ task, status }) => {
      await queryClient.cancelQueries({ queryKey: qk.tasks });
      const previous = queryClient.getQueryData<Task[]>(qk.tasks);
      queryClient.setQueryData<Task[]>(qk.tasks, (list) =>
        list?.map((t) => (t.id === task.id ? { ...t, status } : t)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qk.tasks, context.previous);
    },
    mutationFn: async ({ task, status, includeSubtasks = false }) => {
      if (status === 'done') {
        return must(
          client
            .rpc('complete_task', { p_task_id: task.id, p_include_subtasks: includeSubtasks })
            .single(),
        );
      }
      return must(client.from('tasks').update({ status }).eq('id', task.id).select('*').single());
    },
  });
}

export function useDeleteTask() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['tasks', 'activities', 'sessions'],
    success: 'Tarefa excluída.',
    mutationFn: (id: string) => mustSucceed(client.from('tasks').delete().eq('id', id)),
  });
}

export function useAddDependency() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['tasks'],
    success: 'Dependência adicionada.',
    mutationFn: ({ taskId, dependsOn }: { taskId: string; dependsOn: string }) =>
      mustSucceed(
        client.from('task_dependencies').insert({ task_id: taskId, depends_on_task_id: dependsOn }),
      ),
  });
}

export function useRemoveDependency() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['tasks'],
    success: 'Dependência removida.',
    mutationFn: ({ taskId, dependsOn }: { taskId: string; dependsOn: string }) =>
      mustSucceed(
        client
          .from('task_dependencies')
          .delete()
          .eq('task_id', taskId)
          .eq('depends_on_task_id', dependsOn),
      ),
  });
}
