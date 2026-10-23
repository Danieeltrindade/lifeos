import { Ban, Check, Link2, Pencil, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { formatDateOnly, localDateIn, type ISODate } from '@/lib/date';
import { pluralize } from '@/lib/text';
import { useGoalsQuery, type Category, type Project, type Task } from '@/services/data/queries';
import { TaskTimeSection } from './TaskTimeSection';
import type { Tables } from '@/services/supabase/database.types';
import {
  canComplete,
  estimateLabel,
  isOpen,
  pendingPrerequisites,
  punctuality,
  subtaskSummary,
  wouldCreateCycle,
  type TaskStatus,
} from '../logic/tasks';
import {
  useAddDependency,
  useChangeTaskStatus,
  useCreateTask,
  useDeleteTask,
  useRemoveDependency,
} from '../data/task-mutations';
import { DueBadge, PriorityBadge, StatusBadge } from './TaskBadges';

type Dependency = Tables<'task_dependencies'>;

const dateTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export function TaskDetail({
  task,
  tasks,
  deps,
  projects,
  categories,
  today,
  timezone,
  onEdit,
  onOpenTask,
  onDeleted,
}: {
  task: Task;
  tasks: readonly Task[];
  deps: readonly Dependency[];
  projects: readonly Project[];
  categories: readonly Category[];
  today: ISODate;
  timezone: string;
  onEdit: () => void;
  onOpenTask: (id: string) => void;
  onDeleted: () => void;
}) {
  const changeStatus = useChangeTaskStatus();
  const remove = useDeleteTask();
  const [confirm, setConfirm] = useState<null | 'subtasks' | 'cancel' | 'delete'>(null);

  const subs = tasks.filter((t) => t.parent_task_id === task.id);
  const summary = subtaskSummary(task.id, tasks);
  const check = canComplete(task, tasks, deps);
  const blockers = pendingPrerequisites(task.id, deps, tasks);
  const project = projects.find((p) => p.id === task.project_id);
  const goal = (useGoalsQuery().data ?? []).find((g) => g.id === task.goal_id);
  const parent = tasks.find((t) => t.id === task.parent_task_id);
  const category = categories.find((c) => c.id === task.category_id);
  const completedLocal = task.completed_at
    ? localDateIn(new Date(task.completed_at), timezone)
    : null;
  const punctual = punctuality(task, completedLocal);
  const busy = changeStatus.isPending || remove.isPending;

  const setStatus = (status: TaskStatus, includeSubtasks = false) => {
    changeStatus.mutate(
      { task, status, includeSubtasks },
      {
        onSettled: () => {
          setConfirm(null);
        },
      },
    );
  };

  const onComplete = () => {
    if (!check.ok && check.reason === 'subtasks') setConfirm('subtasks');
    else setStatus('done');
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        <DueBadge dueOn={task.due_on} status={task.status} today={today} />
        {project && <Badge tone="primary">{project.name}</Badge>}
        {goal && <Badge tone="accent">Meta: {goal.title}</Badge>}
        {category && <Badge>{category.name}</Badge>}
      </div>

      {parent && (
        <p className="text-body-sm text-fg-muted">
          Subtarefa de{' '}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              onOpenTask(parent.id);
            }}
          >
            {parent.title}
          </button>
        </p>
      )}

      {task.description && (
        <p className="whitespace-pre-wrap text-body text-fg">{task.description}</p>
      )}

      {isOpen(task) && blockers.length > 0 && (
        <Notice tone="warning" title="Bloqueada por dependências">
          Conclua (ou cancele) antes: {blockers.map((b) => b.title).join(', ')}. Você pode
          iniciá-la, mas não concluí-la.
        </Notice>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Ações da tarefa">
        {isOpen(task) && (
          <Button
            icon={<Check className="size-4" />}
            onClick={onComplete}
            disabled={busy || (!check.ok && check.reason === 'dependencies')}
          >
            Concluir
          </Button>
        )}
        {task.status === 'todo' && (
          <Button
            variant="secondary"
            icon={<Play className="size-4" />}
            disabled={busy}
            onClick={() => {
              setStatus('in_progress');
            }}
          >
            Iniciar
          </Button>
        )}
        {!isOpen(task) && (
          <Button
            variant="secondary"
            icon={<RotateCcw className="size-4" />}
            disabled={busy}
            onClick={() => {
              setStatus('todo');
            }}
          >
            Reabrir
          </Button>
        )}
        <Button
          variant="secondary"
          icon={<Pencil className="size-4" />}
          onClick={onEdit}
          disabled={busy}
        >
          Editar
        </Button>
        {isOpen(task) && (
          <Button
            variant="ghost"
            icon={<Ban className="size-4" />}
            disabled={busy}
            onClick={() => {
              setConfirm('cancel');
            }}
          >
            Cancelar tarefa
          </Button>
        )}
        <Button
          variant="ghost"
          icon={<Trash2 className="size-4" />}
          disabled={busy}
          onClick={() => {
            setConfirm('delete');
          }}
        >
          Excluir
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-surface-muted p-4 text-body-sm sm:grid-cols-3">
        <Info label="Criada" value={dateTime(task.created_at, timezone)} />
        <Info
          label="Início planejado"
          value={task.start_on ? formatDateOnly(task.start_on) : '—'}
        />
        <Info label="Estimativa" value={estimateLabel(task.estimate_minutes) ?? '—'} />
        <Info
          label="Iniciada"
          value={task.started_at ? dateTime(task.started_at, timezone) : '—'}
        />
        <Info
          label="Concluída"
          value={task.completed_at ? dateTime(task.completed_at, timezone) : '—'}
        />
        {task.cancelled_at && (
          <Info label="Cancelada" value={dateTime(task.cancelled_at, timezone)} />
        )}
        {punctual && (
          <Info
            label="Pontualidade"
            value={
              punctual === 'on_time'
                ? 'No prazo'
                : punctual === 'late'
                  ? 'Depois do prazo'
                  : 'Sem prazo'
            }
          />
        )}
      </dl>

      <TaskTimeSection task={task} timezone={timezone} today={today} />

      {task.parent_task_id === null && (
        <SubtasksSection
          task={task}
          subs={subs}
          summaryLabel={summaryLabel(summary)}
          today={today}
          onOpenTask={onOpenTask}
        />
      )}

      <DependenciesSection task={task} tasks={tasks} deps={deps} onOpenTask={onOpenTask} />

      {task.notes && (
        <section aria-labelledby={`notes-${task.id}`}>
          <h3 id={`notes-${task.id}`} className="mb-1 text-body-sm font-semibold">
            Observações
          </h3>
          <p className="whitespace-pre-wrap text-body-sm text-fg-muted">{task.notes}</p>
        </section>
      )}

      <ConfirmDialog
        open={confirm === 'subtasks'}
        title="Concluir com subtarefas?"
        confirmLabel={`Concluir tarefa e ${pluralize(summary.open, 'subtarefa', 'subtarefas')}`}
        tone="primary"
        pending={busy}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          setStatus('done', true);
        }}
      >
        Esta tarefa tem {pluralize(summary.open, 'subtarefa aberta', 'subtarefas abertas')}. Uma
        tarefa só é concluída quando as subtarefas estão concluídas ou canceladas — o LifeOS nunca
        conclui a tarefa-mãe sozinho. Deseja concluir as abertas junto?
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Cancelar tarefa?"
        confirmLabel="Cancelar tarefa"
        pending={busy}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          setStatus('cancelled');
        }}
      >
        Cancelada é diferente de concluída: a tarefa sai das listas abertas e não conta como feita.
        {summary.open > 0 &&
          ` ${pluralize(summary.open, 'subtarefa aberta também será cancelada', 'subtarefas abertas também serão canceladas')}.`}{' '}
        Você pode reabri-la depois.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Excluir tarefa?"
        confirmLabel="Excluir tarefa"
        pending={busy}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          remove.mutate(task.id, {
            onSuccess: () => {
              setConfirm(null);
              onDeleted();
            },
            onError: () => {
              setConfirm(null);
            },
          });
        }}
      >
        A exclusão é permanente.
        {subs.length > 0 && ` As ${String(subs.length)} subtarefas serão excluídas junto.`} Sessões,
        atividades e blocos do calendário ligados a ela são mantidos, apenas sem o vínculo. Se
        quiser só tirá-la das listas, prefira cancelar.
      </ConfirmDialog>
    </div>
  );
}

function summaryLabel(s: ReturnType<typeof subtaskSummary>): string {
  if (s.total === 0) return 'Nenhuma subtarefa';
  return `${String(s.done)} de ${String(s.total - s.cancelled)} concluídas${s.cancelled > 0 ? ` · ${String(s.cancelled)} canceladas` : ''}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="truncate font-medium text-fg">{value}</dd>
    </div>
  );
}

function SubtasksSection({
  task,
  subs,
  summaryLabel: label,
  today,
  onOpenTask,
}: {
  task: Task;
  subs: Task[];
  summaryLabel: string;
  today: ISODate;
  onOpenTask: (id: string) => void;
}) {
  const create = useCreateTask();
  const changeStatus = useChangeTaskStatus();
  const [title, setTitle] = useState('');
  const headingId = `subtasks-${task.id}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-body-sm font-semibold">
          Subtarefas
        </h3>
        <span className="text-caption text-fg-subtle">{label}</span>
      </div>
      {subs.length > 0 && (
        <ul className="mb-2 flex flex-col divide-y divide-border rounded-md border border-border">
          {subs.map((s) => {
            const done = s.status === 'done';
            return (
              <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-[var(--lo-primary)]"
                  checked={done}
                  disabled={s.status === 'cancelled' || changeStatus.isPending}
                  aria-label={done ? `Reabrir ${s.title}` : `Concluir ${s.title}`}
                  onChange={() => {
                    changeStatus.mutate({ task: s, status: done ? 'todo' : 'done' });
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onOpenTask(s.id);
                  }}
                  className={`min-h-9 flex-1 truncate text-left text-body-sm hover:underline ${
                    s.status === 'cancelled'
                      ? 'text-fg-subtle line-through'
                      : done
                        ? 'text-fg-muted'
                        : 'text-fg'
                  }`}
                >
                  {s.title}
                </button>
                <DueBadge dueOn={s.due_on} status={s.status} today={today} />
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = title.trim();
          if (!value) return;
          create.mutate(
            { title: value, parent_task_id: task.id },
            {
              onSuccess: () => {
                setTitle('');
              },
            },
          );
        }}
      >
        <label htmlFor={`${headingId}-new`} className="sr-only">
          Nova subtarefa
        </label>
        <input
          id={`${headingId}-new`}
          value={title}
          maxLength={200}
          placeholder="Nova subtarefa"
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
        />
        <Button
          size="sm"
          variant="secondary"
          type="submit"
          disabled={create.isPending || !title.trim()}
          icon={<Plus className="size-4" />}
        >
          Adicionar
        </Button>
      </form>
    </section>
  );
}

function DependenciesSection({
  task,
  tasks,
  deps,
  onOpenTask,
}: {
  task: Task;
  tasks: readonly Task[];
  deps: readonly Dependency[];
  onOpenTask: (id: string) => void;
}) {
  const add = useAddDependency();
  const remove = useRemoveDependency();
  const [choice, setChoice] = useState('');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const prerequisites = deps
    .filter((d) => d.task_id === task.id)
    .map((d) => byId.get(d.depends_on_task_id))
    .filter((t): t is Task => t !== undefined);
  const dependentTasks = deps
    .filter((d) => d.depends_on_task_id === task.id)
    .map((d) => byId.get(d.task_id))
    .filter((t): t is Task => t !== undefined);
  const existing = new Set(prerequisites.map((t) => t.id));
  // Opções que NÃO criariam ciclo (o banco também recusa).
  const options = tasks.filter(
    (t) =>
      t.id !== task.id &&
      !existing.has(t.id) &&
      t.status !== 'cancelled' &&
      !wouldCreateCycle(task.id, t.id, deps),
  );
  const headingId = `deps-${task.id}`;

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-2 text-body-sm font-semibold">
        Depende de
      </h3>
      {prerequisites.length === 0 ? (
        <p className="mb-2 text-body-sm text-fg-subtle">Nenhuma dependência.</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {prerequisites.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-body-sm">
              <Link2 aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => {
                  onOpenTask(p.id);
                }}
              >
                {p.title}
              </button>
              <StatusBadge status={p.status} />
              <button
                type="button"
                aria-label={`Remover dependência de ${p.title}`}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate({ taskId: task.id, dependsOn: p.id });
                }}
                className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 && (
        <div className="flex gap-2">
          <label htmlFor={`${headingId}-add`} className="sr-only">
            Adicionar dependência
          </label>
          <select
            id={`${headingId}-add`}
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
            }}
            className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-2.5 text-body-sm"
          >
            <option value="">Escolha uma tarefa…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!choice || add.isPending}
            onClick={() => {
              add.mutate(
                { taskId: task.id, dependsOn: choice },
                {
                  onSuccess: () => {
                    setChoice('');
                  },
                },
              );
            }}
          >
            Adicionar
          </Button>
        </div>
      )}
      {dependentTasks.length > 0 && (
        <p className="mt-2 text-caption text-fg-subtle">
          Bloqueia: {dependentTasks.map((t) => t.title).join(', ')}.
        </p>
      )}
    </section>
  );
}
