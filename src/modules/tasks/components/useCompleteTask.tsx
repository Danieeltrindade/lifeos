import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toast-context';
import { pluralize } from '@/lib/text';
import type { Task } from '@/services/data/queries';
import type { Tables } from '@/services/supabase/database.types';
import { canComplete } from '../logic/tasks';
import { useChangeTaskStatus } from '../data/task-mutations';

/**
 * Fluxo de "concluir" usado pela lista e pelo Kanban:
 *  - dependência aberta → explica e não tenta (o banco recusaria);
 *  - subtarefas abertas → pergunta se deve concluí-las junto (nunca automático);
 *  - caso contrário, conclui.
 */
export function useCompleteTask(
  tasks: readonly Task[],
  deps: readonly Tables<'task_dependencies'>[],
): { request: (task: Task) => void; dialog: ReactNode; pending: boolean } {
  const change = useChangeTaskStatus();
  const toast = useToast();
  const [pendingParent, setPendingParent] = useState<{ task: Task; open: number } | null>(null);

  const request = (task: Task) => {
    const check = canComplete(task, tasks, deps);
    if (check.ok) {
      change.mutate({ task, status: 'done' });
    } else if (check.reason === 'dependencies') {
      toast.show({
        tone: 'danger',
        message: `Conclua antes: ${check.blockers.map((b) => b.title).join(', ')}.`,
      });
    } else {
      setPendingParent({ task, open: check.open });
    }
  };

  const dialog = (
    <ConfirmDialog
      open={pendingParent !== null}
      title="Concluir com subtarefas?"
      tone="primary"
      confirmLabel={
        pendingParent
          ? `Concluir tarefa e ${pluralize(pendingParent.open, 'subtarefa', 'subtarefas')}`
          : 'Concluir'
      }
      pending={change.isPending}
      onCancel={() => {
        setPendingParent(null);
      }}
      onConfirm={() => {
        if (!pendingParent) return;
        change.mutate(
          { task: pendingParent.task, status: 'done', includeSubtasks: true },
          {
            onSettled: () => {
              setPendingParent(null);
            },
          },
        );
      }}
    >
      {pendingParent &&
        `“${pendingParent.task.title}” tem ${pluralize(pendingParent.open, 'subtarefa aberta', 'subtarefas abertas')}. A tarefa-mãe só é concluída com as subtarefas concluídas ou canceladas.`}
    </ConfirmDialog>
  );

  return { request, dialog, pending: change.isPending };
}
