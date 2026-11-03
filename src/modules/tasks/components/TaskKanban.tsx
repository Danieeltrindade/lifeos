import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Link2, ListTree } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { ISODate } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { Project, Task } from '@/services/data/queries';
import type { Tables } from '@/services/supabase/database.types';
import {
  isOpen,
  pendingPrerequisites,
  STATUS_LABELS,
  subtaskSummary,
  type TaskStatus,
} from '../logic/tasks';
import { DueMeta, PriorityFlag } from './TaskBadges';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'done', 'cancelled'];

function isStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (COLUMNS as string[]).includes(value);
}

/**
 * Quadro Kanban: arrastar um cartão para outra coluna muda o status (com as mesmas regras
 * da lista — concluir respeita dependências e subtarefas). Funciona com mouse, toque e
 * teclado (Espaço para pegar, setas para mover, Espaço para soltar, Esc para cancelar).
 */
export function TaskKanban({
  tasks,
  allTasks,
  deps,
  projects,
  today,
  onOpen,
  onMove,
}: {
  tasks: Task[];
  allTasks: readonly Task[];
  deps: readonly Tables<'task_dependencies'>[];
  projects: readonly Project[];
  today: ISODate;
  onOpen: (id: string) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? 'tarefa';
  const columnOf = (id: string | number | undefined) =>
    isStatus(id) ? STATUS_LABELS[id] : 'fora das colunas';

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou “${titleOf(active.id)}”.`,
    onDragOver: ({ active, over }) =>
      `“${titleOf(active.id)}” sobre a coluna ${columnOf(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      over ? `“${titleOf(active.id)}” solto em ${columnOf(over.id)}.` : 'Movimento cancelado.',
    onDragCancel: ({ active }) => `Movimento de “${titleOf(active.id)}” cancelado.`,
  };

  const onDragEnd = (event: DragEndEvent) => {
    const task = byId.get(String(event.active.id));
    const target = event.over?.id;
    if (!task || !isStatus(target) || target === task.status) return;
    onMove(task, target);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Para mover, pressione Espaço; use as setas para escolher a coluna e Espaço de novo para soltar. Esc cancela.',
        },
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[880px] grid-cols-4 gap-3">
          {COLUMNS.map((status) => {
            const items = tasks.filter((t) => t.status === status);
            return (
              <Column key={status} status={status} count={items.length}>
                {items.map((task) => (
                  <Card
                    key={task.id}
                    task={task}
                    today={today}
                    projectName={task.project_id ? projectNames.get(task.project_id) : undefined}
                    blocked={
                      isOpen(task) && pendingPrerequisites(task.id, deps, allTasks).length > 0
                    }
                    subtasks={subtaskSummary(task.id, allTasks)}
                    onOpen={onOpen}
                  />
                ))}
              </Column>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}

function Column({
  status,
  count,
  children,
}: {
  status: TaskStatus;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const headingId = `kanban-${status}`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        'flex min-h-48 flex-col gap-2 rounded-lg border border-border bg-surface-muted p-2 transition-colors',
        isOver && 'border-primary bg-primary-soft',
      )}
    >
      <h2
        id={headingId}
        className="flex items-center justify-between px-1.5 pt-1 text-body-sm font-semibold"
      >
        {STATUS_LABELS[status]}
        <span className="text-caption font-normal text-fg-subtle">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="px-1.5 py-4 text-center text-caption text-fg-subtle">
          Arraste tarefas para cá
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function Card({
  task,
  today,
  projectName,
  blocked,
  subtasks,
  onOpen,
}: {
  task: Task;
  today: ISODate;
  projectName: string | undefined;
  blocked: boolean;
  subtasks: ReturnType<typeof subtaskSummary>;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'flex items-start gap-1 rounded-md border border-border surface-card p-2 shadow-elev-1',
        isDragging && 'relative z-10 shadow-elev-3',
      )}
    >
      <button
        type="button"
        aria-label={`Mover “${task.title}”`}
        className="grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-sm text-fg-subtle hover:text-fg"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => {
            onOpen(task.id);
          }}
          className={cn(
            'block w-full py-1.5 text-left text-body-sm font-medium hover:text-primary',
            task.status === 'cancelled' && 'text-fg-subtle line-through',
          )}
        >
          {task.title}
        </button>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-0.5">
          <PriorityFlag priority={task.priority} />
          <DueMeta dueOn={task.due_on} status={task.status} today={today} />
          {projectName && (
            <span className="max-w-full truncate text-caption text-fg-subtle">{projectName}</span>
          )}
          {subtasks.total > 0 && (
            <span className="inline-flex items-center gap-1 text-caption text-fg-subtle tabular">
              <ListTree aria-hidden="true" className="size-3" />
              {subtasks.done}/{subtasks.total - subtasks.cancelled}
            </span>
          )}
          {blocked && (
            <Badge tone="warning">
              <Link2 aria-hidden="true" className="size-3" />
              Bloqueada
            </Badge>
          )}
        </div>
      </div>
    </li>
  );
}
