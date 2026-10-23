import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Flag,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Notice';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ListSkeleton, QueryState } from '@/components/ui/QueryState';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { formatDateOnly } from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import { pluralize } from '@/lib/text';
import {
  useCategoriesQuery,
  useProjectsQuery,
  useTaskDependenciesQuery,
  useTasksQuery,
  type Project,
} from '@/services/data/queries';
import { PriorityBadge } from '@/modules/tasks/components/TaskBadges';
import { TaskDialog, type TaskDialogState } from '@/modules/tasks/components/TaskDialog';
import { TaskList } from '@/modules/tasks/components/TaskList';
import { useCompleteTask } from '@/modules/tasks/components/useCompleteTask';
import { useChangeTaskStatus } from '@/modules/tasks/data/task-mutations';
import { sortTasks } from '@/modules/tasks/logic/tasks';
import { ProjectForm } from './components/ProjectForm';
import {
  useCreateMilestone,
  useDeleteMilestone,
  useDeleteProject,
  useMilestonesQuery,
  useProjectHistoryQuery,
  useUpdateMilestone,
  useUpdateProject,
} from './data/project-api';
import {
  isProjectOverdue,
  milestoneProgress,
  PROJECT_STATUS_LABELS,
  projectProgress,
  type ProjectStatus,
} from './logic/projects';

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const projectsQuery = useProjectsQuery();

  if (projectsQuery.status === 'pending') return <ListSkeleton rows={3} />;
  if (projectsQuery.status === 'error') {
    return (
      <ErrorState
        title="Não foi possível carregar o projeto"
        description={errorMessage(projectsQuery.error)}
        onRetry={() => {
          void projectsQuery.refetch();
        }}
      />
    );
  }
  const project = projectsQuery.data.find((p) => p.id === projectId);
  if (!project) {
    return (
      <EmptyState
        title="Projeto não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Link to="/projetos" className="font-medium text-primary hover:underline">
            Voltar aos projetos
          </Link>
        }
      />
    );
  }
  return <ProjectDetail key={project.id} project={project} />;
}

function ProjectDetail({ project }: { project: Project }) {
  const { today, timezone } = useUserCalendar();
  const navigate = useNavigate();
  const tasksQuery = useTasksQuery();
  const depsQuery = useTaskDependenciesQuery();
  const categories = useCategoriesQuery().data ?? [];
  const projects = useProjectsQuery().data ?? [];
  const archive = useUpdateProject(
    project.archived_at ? 'Projeto restaurado.' : 'Projeto arquivado.',
  );
  const remove = useDeleteProject();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>({ mode: 'closed' });

  const allTasks = tasksQuery.data ?? [];
  const deps = depsQuery.data ?? [];
  const projectTasks = sortTasks(
    allTasks.filter((t) => t.project_id === project.id),
    'smart',
    today,
  );
  const progress = projectProgress(project.id, allTasks);
  const complete = useCompleteTask(allTasks, deps);
  const changeStatus = useChangeTaskStatus();
  const overdue = isProjectOverdue(project, today);
  const status = project.status as ProjectStatus;

  return (
    <div className="animate-fade-up">
      <Link
        to="/projetos"
        className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-body-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Projetos
      </Link>
      <PageHeader
        title={project.name}
        description={project.description || undefined}
        eyebrow={
          <span className="flex flex-wrap gap-1.5">
            <Badge tone={status === 'active' ? 'primary' : 'neutral'}>
              {PROJECT_STATUS_LABELS[status]}
            </Badge>
            <PriorityBadge priority={project.priority} />
            {project.archived_at && <Badge tone="warning">Arquivado</Badge>}
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Pencil className="size-4" />}
              onClick={() => {
                setEditing(true);
              }}
            >
              Editar
            </Button>
            <Button
              variant="secondary"
              icon={
                project.archived_at ? (
                  <ArchiveRestore className="size-4" />
                ) : (
                  <Archive className="size-4" />
                )
              }
              disabled={archive.isPending}
              onClick={() => {
                archive.mutate({
                  id: project.id,
                  patch: { archived_at: project.archived_at ? null : new Date().toISOString() },
                });
              }}
            >
              {project.archived_at ? 'Restaurar' : 'Arquivar'}
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              Excluir
            </Button>
          </>
        }
      />

      {overdue && (
        <Notice tone="warning" className="mb-6" title="Prazo vencido">
          O prazo era {formatDateOnly(project.due_on ?? today)}. O status não muda sozinho:
          atualize-o ou ajuste o prazo.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card aria-labelledby="project-progress">
            <CardHeader title="Progresso" titleId="project-progress" />
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-display font-semibold tabular">
                  {progress.ratio === null ? '—' : `${String(Math.round(progress.ratio * 100))}%`}
                </p>
                <p className="text-body-sm text-fg-muted">
                  {progress.total === 0
                    ? 'Nenhuma tarefa válida'
                    : `${String(progress.done)} de ${pluralize(progress.total, 'tarefa concluída', 'tarefas concluídas')}`}
                  {progress.cancelled > 0 &&
                    ` · ${String(progress.cancelled)} canceladas fora da conta`}
                </p>
              </div>
              <ProgressBar
                value={progress.done}
                max={Math.max(progress.total, 1)}
                label="Progresso do projeto"
                valueText={
                  progress.ratio === null
                    ? 'Sem tarefas'
                    : `${String(Math.round(progress.ratio * 100))}%`
                }
              />
              <p className="text-caption text-fg-subtle">
                Calculado: tarefas concluídas ÷ tarefas do projeto (subtarefas incluídas, canceladas
                excluídas). Não é um percentual digitado.
              </p>
              <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4">
                <Field
                  label="Início"
                  value={project.start_on ? formatDateOnly(project.start_on) : '—'}
                />
                <Field
                  label="Prazo"
                  value={project.due_on ? formatDateOnly(project.due_on) : '—'}
                />
                <Field label="Abertas" value={String(progress.open)} />
                <Field label="Concluídas" value={String(progress.done)} />
              </dl>
            </CardBody>
          </Card>

          <section aria-labelledby="project-tasks">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="project-tasks" className="text-title-sm font-semibold">
                Tarefas
              </h2>
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  setTaskDialog({ mode: 'create', defaults: { projectId: project.id } });
                }}
              >
                Nova tarefa
              </Button>
            </div>
            {tasksQuery.status === 'pending' ? (
              <ListSkeleton rows={3} />
            ) : tasksQuery.status === 'error' ? (
              <ErrorState
                description={errorMessage(tasksQuery.error)}
                onRetry={() => {
                  void tasksQuery.refetch();
                }}
              />
            ) : projectTasks.length === 0 ? (
              <EmptyState
                compact
                title="Nenhuma tarefa neste projeto"
                description="Crie tarefas para acompanhar o progresso."
              />
            ) : (
              <TaskList
                visible={projectTasks}
                allTasks={allTasks}
                deps={deps}
                projects={projects}
                today={today}
                busy={complete.pending || changeStatus.isPending}
                onOpen={(id) => {
                  setTaskDialog({ mode: 'view', taskId: id });
                }}
                onToggleDone={(task) => {
                  if (task.status === 'done') changeStatus.mutate({ task, status: 'todo' });
                  else complete.request(task);
                }}
              />
            )}
          </section>

          {project.notes && (
            <Card aria-labelledby="project-notes">
              <CardHeader title="Observações" titleId="project-notes" />
              <CardBody>
                <p className="whitespace-pre-wrap text-body-sm text-fg-muted">{project.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <MilestonesCard projectId={project.id} />
          <HistoryCard projectId={project.id} timezone={timezone} />
        </div>
      </div>

      {complete.dialog}
      <TaskDialog
        state={taskDialog}
        onChange={setTaskDialog}
        tasks={allTasks}
        deps={deps}
        projects={projects}
        categories={categories}
        today={today}
        timezone={timezone}
      />
      <Dialog
        open={editing}
        onClose={() => {
          setEditing(false);
        }}
        title="Editar projeto"
        size="lg"
      >
        <ProjectForm
          project={project}
          onSaved={() => {
            setEditing(false);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir projeto?"
        confirmLabel="Excluir projeto"
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          remove.mutate(project.id, {
            onSuccess: () => {
              void navigate('/projetos');
            },
            onSettled: () => {
              setConfirmDelete(false);
            },
          });
        }}
      >
        A exclusão é permanente: marcos e histórico de status saem junto. As{' '}
        {pluralize(projectTasks.length, 'tarefa continua', 'tarefas continuam')} existindo, sem
        projeto — nada é apagado em cascata sem aviso. Metas ligadas ao projeto impedem a exclusão.
        Para só tirar o projeto de vista, prefira arquivar.
      </ConfirmDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function MilestonesCard({ projectId }: { projectId: string }) {
  const query = useMilestonesQuery(projectId);
  const create = useCreateMilestone();
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');

  return (
    <Card aria-labelledby="project-milestones">
      <CardHeader title="Marcos" titleId="project-milestones" icon={<Flag className="size-4" />} />
      <CardBody className="flex flex-col gap-3">
        <QueryState
          query={query}
          title="Não foi possível carregar os marcos"
          skeleton={<ListSkeleton rows={2} />}
        >
          {(milestones) => {
            const mp = milestoneProgress(milestones);
            return milestones.length === 0 ? (
              <p className="text-body-sm text-fg-subtle">
                Nenhum marco. Marcos são entregas intermediárias.
              </p>
            ) : (
              <>
                <p className="text-caption text-fg-subtle">
                  {mp.done} de {mp.total} atingidos (contagem própria, fora do percentual de
                  tarefas)
                </p>
                <ul className="flex flex-col gap-1">
                  {milestones.map((m) => {
                    const done = m.completed_at !== null;
                    return (
                      <li key={m.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 accent-[var(--lo-primary)]"
                          checked={done}
                          aria-label={
                            done
                              ? `Desmarcar marco ${m.title}`
                              : `Marcar marco ${m.title} como atingido`
                          }
                          onChange={() => {
                            update.mutate({
                              id: m.id,
                              patch: { completed_at: done ? null : new Date().toISOString() },
                            });
                          }}
                        />
                        <span
                          className={`min-w-0 flex-1 text-body-sm ${done ? 'text-fg-muted line-through' : ''}`}
                        >
                          {m.title}
                        </span>
                        {m.due_on && <Badge>{formatDateOnly(m.due_on)}</Badge>}
                        <button
                          type="button"
                          aria-label={`Excluir marco ${m.title}`}
                          disabled={remove.isPending}
                          onClick={() => {
                            remove.mutate(m.id);
                          }}
                          className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            );
          }}
        </QueryState>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = title.trim();
            if (!value) return;
            create.mutate(
              {
                project_id: projectId,
                title: value,
                due_on: dueOn || null,
                sort_order: query.data?.length ?? 0,
              },
              {
                onSuccess: () => {
                  setTitle('');
                  setDueOn('');
                },
              },
            );
          }}
        >
          <label htmlFor="milestone-title" className="sr-only">
            Novo marco
          </label>
          <input
            id="milestone-title"
            value={title}
            maxLength={200}
            placeholder="Novo marco"
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            className="h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
          />
          <div className="flex gap-2">
            <label htmlFor="milestone-due" className="sr-only">
              Data do marco
            </label>
            <input
              id="milestone-due"
              type="date"
              value={dueOn}
              onChange={(e) => {
                setDueOn(e.target.value);
              }}
              className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              type="submit"
              disabled={!title.trim() || create.isPending}
              icon={<Check className="size-4" />}
            >
              Adicionar
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function HistoryCard({ projectId, timezone }: { projectId: string; timezone: string }) {
  const query = useProjectHistoryQuery(projectId);
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const labels: Record<string, string> = PROJECT_STATUS_LABELS;
  const label = (s: string | null) => (s ? (labels[s] ?? s) : null);
  return (
    <Card aria-labelledby="project-history">
      <CardHeader title="Histórico de status" titleId="project-history" />
      <CardBody>
        <QueryState
          query={query}
          title="Não foi possível carregar o histórico"
          skeleton={<ListSkeleton rows={2} />}
        >
          {(rows) =>
            rows.length === 0 ? (
              <p className="text-body-sm text-fg-subtle">Sem registros.</p>
            ) : (
              <ol className="flex flex-col gap-2 border-l border-border pl-4">
                {rows.map((r) => (
                  <li key={r.id} className="text-body-sm">
                    <p className="font-medium">
                      {r.from_status
                        ? `${label(r.from_status) ?? ''} → ${label(r.to_status) ?? ''}`
                        : `Criado como ${label(r.to_status) ?? ''}`}
                    </p>
                    <p className="text-caption text-fg-subtle">
                      {fmt.format(new Date(r.changed_at))}
                    </p>
                  </li>
                ))}
              </ol>
            )
          }
        </QueryState>
      </CardBody>
    </Card>
  );
}
