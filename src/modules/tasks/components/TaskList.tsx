import { Check, CornerDownRight, Link2, ListTree, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { ISODate } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { Project, Task } from '@/services/data/queries';
import type { Tables } from '@/services/supabase/database.types';
import { isOpen, pendingPrerequisites, subtaskSummary } from '../logic/tasks';
import { DueBadge, PriorityBadge } from './TaskBadges';

/**
 * Lista de tarefas. Subtarefas aparecem recuadas logo abaixo da mãe quando ela está na
 * lista; quando a mãe foi filtrada, a subtarefa aparece sozinha com a indicação da mãe.
 */
export function TaskList({
  visible,
  allTasks,
  deps,
  projects,
  today,
  onOpen,
  onToggleDone,
  busy,
}: {
  visible: Task[];
  allTasks: readonly Task[];
  deps: readonly Tables<'task_dependencies'>[];
  projects: readonly Project[];
  today: ISODate;
  onOpen: (id: string) => void;
  onToggleDone: (task: Task) => void;
  busy: boolean;
}) {
  const visibleIds = new Set(visible.map((t) => t.id));
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const parents = new Map(allTasks.map((t) => [t.id, t]));
  const ordered: { task: Task; nested: boolean }[] = [];
  for (const t of visible) {
    if (t.parent_task_id && visibleIds.has(t.parent_task_id)) continue;
    ordered.push({ task: t, nested: false });
    for (const s of visible.filter((x) => x.parent_task_id === t.id)) {
      ordered.push({ task: s, nested: true });
    }
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-elev-1">
      {ordered.map(({ task, nested }) => {
        const blocked = isOpen(task) && pendingPrerequisites(task.id, deps, allTasks).length > 0;
        const subs = subtaskSummary(task.id, allTasks);
        const parent = task.parent_task_id ? parents.get(task.parent_task_id) : undefined;
        const done = task.status === 'done';
        const cancelled = task.status === 'cancelled';
        return (
          <li
            key={task.id}
            className={cn('flex items-start gap-3 px-3 py-2.5 sm:px-4', nested && 'pl-10 sm:pl-12')}
          >
            <button
              type="button"
              disabled={busy || cancelled}
              onClick={() => {
                onToggleDone(task);
              }}
              aria-label={done ? `Reabrir “${task.title}”` : `Concluir “${task.title}”`}
              title={blocked ? 'Há dependências abertas' : undefined}
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors',
                done
                  ? 'border-success bg-success text-white'
                  : 'border-border-strong text-transparent hover:border-primary hover:text-primary',
                cancelled && 'opacity-40',
              )}
            >
              {done ? (
                <RotateCcw aria-hidden="true" className="size-3.5" />
              ) : (
                <Check aria-hidden="true" className="size-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  onOpen(task.id);
                }}
                className={cn(
                  'block w-full truncate py-1.5 text-left font-medium hover:underline',
                  done && 'text-fg-muted',
                  cancelled && 'text-fg-subtle line-through',
                )}
              >
                {nested && <span className="sr-only">Subtarefa: </span>}
                {task.title}
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                {cancelled && <Badge>Cancelada</Badge>}
                {task.status === 'in_progress' && <Badge tone="info">Em andamento</Badge>}
                <PriorityBadge priority={task.priority} />
                <DueBadge dueOn={task.due_on} status={task.status} today={today} />
                {task.project_id && projectNames.has(task.project_id) && !nested && (
                  <Badge tone="primary">{projectNames.get(task.project_id)}</Badge>
                )}
                {subs.total > 0 && (
                  <Badge>
                    <ListTree aria-hidden="true" className="size-3" />
                    {subs.done}/{subs.total - subs.cancelled} subtarefas
                  </Badge>
                )}
                {blocked && (
                  <Badge tone="warning">
                    <Link2 aria-hidden="true" className="size-3" />
                    Bloqueada
                  </Badge>
                )}
                {parent && !nested && (
                  <span className="inline-flex items-center gap-1 text-caption text-fg-subtle">
                    <CornerDownRight aria-hidden="true" className="size-3" />
                    {parent.title}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
