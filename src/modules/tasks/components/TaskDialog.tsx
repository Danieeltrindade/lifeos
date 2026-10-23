import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import type { ISODate } from '@/lib/date';
import type { Category, Project, Task } from '@/services/data/queries';
import type { Tables } from '@/services/supabase/database.types';
import { TaskDetail } from './TaskDetail';
import { TaskForm, type TaskFormDefaults } from './TaskForm';

export type TaskDialogState =
  | { mode: 'closed' }
  | { mode: 'create'; defaults?: TaskFormDefaults }
  | { mode: 'view'; taskId: string };

/**
 * Diálogo único de tarefas: criar, ver detalhes (com ações) e editar. Os dados vêm das
 * listas já carregadas, então qualquer mudança aparece aqui na hora.
 */
export function TaskDialog({
  state,
  onChange,
  tasks,
  deps,
  projects,
  categories,
  today,
  timezone,
}: {
  state: TaskDialogState;
  onChange: (state: TaskDialogState) => void;
  tasks: readonly Task[];
  deps: readonly Tables<'task_dependencies'>[];
  projects: readonly Project[];
  categories: readonly Category[];
  today: ISODate;
  timezone: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const close = () => {
    setEditingId(null);
    onChange({ mode: 'closed' });
  };

  if (state.mode === 'closed') return null;

  if (state.mode === 'create') {
    return (
      <Dialog open onClose={close} title="Nova tarefa" size="lg">
        <TaskForm
          defaults={state.defaults ?? {}}
          tasks={tasks}
          projects={projects}
          categories={categories}
          onSaved={(saved) => {
            onChange({ mode: 'view', taskId: saved.id });
          }}
          onCancel={close}
        />
      </Dialog>
    );
  }

  const task = tasks.find((t) => t.id === state.taskId);
  if (!task) {
    return (
      <Dialog open onClose={close} title="Tarefa não encontrada" size="sm">
        <p className="text-body-sm text-fg-muted">Ela pode ter sido excluída.</p>
      </Dialog>
    );
  }
  const editing = editingId === task.id;

  return (
    <Dialog open onClose={close} title={editing ? 'Editar tarefa' : task.title} size="lg">
      {editing ? (
        <TaskForm
          task={task}
          tasks={tasks}
          projects={projects}
          categories={categories}
          onSaved={() => {
            setEditingId(null);
          }}
          onCancel={() => {
            setEditingId(null);
          }}
        />
      ) : (
        <TaskDetail
          task={task}
          tasks={tasks}
          deps={deps}
          projects={projects}
          categories={categories}
          today={today}
          timezone={timezone}
          onEdit={() => {
            setEditingId(task.id);
          }}
          onOpenTask={(id) => {
            setEditingId(null);
            onChange({ mode: 'view', taskId: id });
          }}
          onDeleted={close}
        />
      )}
    </Dialog>
  );
}
