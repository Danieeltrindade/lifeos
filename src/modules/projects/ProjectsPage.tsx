import { FolderKanban, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { QueryState } from '@/components/ui/QueryState';
import { FilterSelect, SearchField } from '@/components/ui/SearchField';
import { EmptyState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { formatDateOnly } from '@/lib/date';
import { matchesSearch, pluralize } from '@/lib/text';
import { useProjectsQuery, useTasksQuery, type Project } from '@/services/data/queries';
import { PriorityBadge } from '@/modules/tasks/components/TaskBadges';
import { ProjectForm } from './components/ProjectForm';
import {
  isProjectOverdue,
  PROJECT_STATUS_LABELS,
  projectProgress,
  type ProjectStatus,
} from './logic/projects';

type Scope = 'open' | 'all' | 'archived' | ProjectStatus;

export function ProjectsPage() {
  const { today } = useUserCalendar();
  const navigate = useNavigate();
  const projectsQuery = useProjectsQuery();
  const tasksQuery = useTasksQuery();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('open');
  const tasks = tasksQuery.data ?? [];

  const visible = (projects: Project[]) =>
    projects.filter((p) => {
      if (scope === 'archived') {
        if (p.archived_at === null) return false;
      } else if (p.archived_at !== null) return false;
      if (scope === 'open' && (p.status === 'completed' || p.status === 'cancelled')) return false;
      if (scope !== 'open' && scope !== 'all' && scope !== 'archived' && p.status !== scope)
        return false;
      return matchesSearch(search, p.name, p.description);
    });

  return (
    <div className="animate-fade-up">
      <PageHeader
        module="projects"
        eyebrow={<span className="inline-flex items-center gap-2">Planejar</span>}
        title="Projetos"
        description="Resultados maiores, divididos em tarefas e marcos. O progresso vem das tarefas concluídas."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setCreating(true);
            }}
          >
            Novo projeto
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <SearchField
          className="flex-1"
          label="Buscar projetos"
          value={search}
          onChange={setSearch}
        />
        <FilterSelect
          className="sm:w-56"
          label="Mostrar"
          value={scope}
          onChange={(v) => {
            setScope(v as Scope);
          }}
          options={[
            { value: 'open', label: 'Em aberto' },
            { value: 'all', label: 'Todos (não arquivados)' },
            ...(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => ({
              value: s,
              label: PROJECT_STATUS_LABELS[s],
            })),
            { value: 'archived', label: 'Arquivados' },
          ]}
        />
      </div>
      <QueryState query={projectsQuery} title="Não foi possível carregar os projetos">
        {(projects) => {
          if (projects.length === 0) {
            return (
              <EmptyState
                icon={<FolderKanban className="size-6" />}
                title="Nenhum projeto ainda"
                description="Crie um projeto para agrupar tarefas em torno de um resultado, com marcos e prazo."
                action={
                  <Button
                    icon={<Plus className="size-4" />}
                    onClick={() => {
                      setCreating(true);
                    }}
                  >
                    Novo projeto
                  </Button>
                }
              />
            );
          }
          const list = visible(projects);
          if (list.length === 0) {
            return <EmptyState title="Nenhum projeto com esses filtros" />;
          }
          return (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => {
                const progress = projectProgress(p.id, tasks);
                const overdue = isProjectOverdue(p, today);
                return (
                  <li key={p.id}>
                    <Link
                      to={`/projetos/${p.id}`}
                      className="flex h-full flex-col gap-3 rounded-lg border border-border surface-card p-4 shadow-elev-1 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="min-w-0 font-semibold">{p.name}</h2>
                        <Badge tone={p.status === 'active' ? 'primary' : 'neutral'}>
                          {PROJECT_STATUS_LABELS[p.status as ProjectStatus]}
                        </Badge>
                      </div>
                      {p.description && (
                        <p className="line-clamp-2 text-body-sm text-fg-muted">{p.description}</p>
                      )}
                      <div className="mt-auto flex flex-col gap-1.5">
                        <div className="flex justify-between text-caption text-fg-subtle">
                          <span>
                            {progress.ratio === null
                              ? 'Sem tarefas'
                              : `${String(progress.done)} de ${pluralize(progress.total, 'tarefa', 'tarefas')}`}
                          </span>
                          {progress.ratio !== null && (
                            <span>{Math.round(progress.ratio * 100)}%</span>
                          )}
                        </div>
                        <ProgressBar
                          value={progress.done}
                          max={Math.max(progress.total, 1)}
                          label={`Progresso de ${p.name}`}
                          valueText={
                            progress.ratio === null
                              ? 'Sem tarefas'
                              : `${String(progress.done)} de ${String(progress.total)} tarefas concluídas`
                          }
                        />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <PriorityBadge priority={p.priority} />
                          {p.due_on && (
                            <Badge tone={overdue ? 'danger' : 'neutral'}>
                              {overdue ? 'Prazo vencido · ' : 'Prazo · '}
                              {formatDateOnly(p.due_on)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryState>
      <Dialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        title="Novo projeto"
        size="lg"
      >
        <ProjectForm
          onSaved={(project) => {
            setCreating(false);
            void navigate(`/projetos/${project.id}`);
          }}
          onCancel={() => {
            setCreating(false);
          }}
        />
      </Dialog>
    </div>
  );
}
