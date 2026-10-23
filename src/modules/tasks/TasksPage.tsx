import { CheckSquare, Columns3, List, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/ui/QueryState';
import { FilterSelect, SearchField } from '@/components/ui/SearchField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { errorMessage } from '@/lib/query/query-client';
import { pluralize } from '@/lib/text';
import {
  useCategoriesQuery,
  useProjectsQuery,
  useTaskDependenciesQuery,
  useTasksQuery,
} from '@/services/data/queries';
import { TaskDialog, type TaskDialogState } from './components/TaskDialog';
import { TaskKanban } from './components/TaskKanban';
import { TaskList } from './components/TaskList';
import { useCompleteTask } from './components/useCompleteTask';
import { useChangeTaskStatus } from './data/task-mutations';
import {
  DEFAULT_FILTERS,
  filterTasks,
  isOverdue,
  PRIORITY_LABELS,
  sortTasks,
  STATUS_LABELS,
  type DueFilter,
  type SortKey,
  type StatusFilter,
  type TaskFilters,
} from './logic/tasks';

type View = 'list' | 'kanban';

export function TasksPage() {
  const { today, timezone } = useUserCalendar();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('visao') === 'kanban' ? 'kanban' : 'list';
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [dialog, setDialog] = useState<TaskDialogState>(() => {
    const id = params.get('tarefa');
    return id ? { mode: 'view', taskId: id } : { mode: 'closed' };
  });

  const tasksQuery = useTasksQuery();
  const depsQuery = useTaskDependenciesQuery();
  const projectsQuery = useProjectsQuery();
  const categoriesQuery = useCategoriesQuery();
  const tasks = tasksQuery.data ?? [];
  const deps = depsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const complete = useCompleteTask(tasks, deps);
  const changeStatus = useChangeTaskStatus();

  const set = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const setView = (next: View) => {
    setParams(
      (p) => {
        if (next === 'kanban') p.set('visao', 'kanban');
        else p.delete('visao');
        return p;
      },
      { replace: true },
    );
  };

  const filtered = sortTasks(
    filterTasks(tasks, view === 'kanban' ? { ...filters, status: 'all' } : filters, today),
    filters.sort,
    today,
  );
  const overdueCount = tasks.filter((t) => isOverdue(t, today)).length;
  const hasFilters =
    filters.search !== '' ||
    filters.priority !== 'all' ||
    filters.due !== 'all' ||
    filters.project !== 'all' ||
    (view === 'list' && filters.status !== 'open');

  const loading = tasksQuery.status === 'pending' || depsQuery.status === 'pending';
  const error = tasksQuery.error ?? depsQuery.error;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <CheckSquare aria-hidden="true" className="size-4" />
            Planejar
          </span>
        }
        title="Tarefas"
        description="O que precisa ser feito, com prazo, prioridade, subtarefas e dependências."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setDialog({ mode: 'create' });
            }}
          >
            Nova tarefa
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField
            className="flex-1"
            label="Buscar tarefas"
            placeholder="Buscar por título, descrição ou observação"
            value={filters.search}
            onChange={(v) => {
              set('search', v);
            }}
          />
          <SegmentedControl<View>
            label="Visualização"
            value={view}
            onChange={setView}
            options={[
              {
                value: 'list',
                label: 'Lista',
                icon: <List aria-hidden="true" className="size-4" />,
              },
              {
                value: 'kanban',
                label: 'Kanban',
                icon: <Columns3 aria-hidden="true" className="size-4" />,
              },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {view === 'list' && (
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => {
                set('status', v as StatusFilter);
              }}
              options={[
                { value: 'open', label: 'Abertas' },
                { value: 'all', label: 'Todas' },
                ...(['todo', 'in_progress', 'done', 'cancelled'] as const).map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                })),
              ]}
            />
          )}
          <FilterSelect
            label="Prioridade"
            value={filters.priority}
            onChange={(v) => {
              set('priority', v as TaskFilters['priority']);
            }}
            options={[
              { value: 'all', label: 'Todas' },
              ...(['high', 'medium', 'low'] as const).map((p) => ({
                value: p,
                label: PRIORITY_LABELS[p],
              })),
            ]}
          />
          <FilterSelect
            label="Prazo"
            value={filters.due}
            onChange={(v) => {
              set('due', v as DueFilter);
            }}
            options={[
              { value: 'all', label: 'Qualquer' },
              { value: 'overdue', label: 'Atrasadas' },
              { value: 'today', label: 'Hoje' },
              { value: 'week', label: 'Próximos 7 dias' },
              { value: 'none', label: 'Sem prazo' },
            ]}
          />
          <FilterSelect
            label="Projeto"
            value={filters.project}
            onChange={(v) => {
              set('project', v);
            }}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'none', label: 'Sem projeto' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <FilterSelect
            label="Ordenar por"
            // Na lista há 5 filtros: no celular (2 colunas) o último ocupa a linha inteira,
            // para que "Atrasadas e prioridade" não seja cortado.
            {...(view === 'list' ? { className: 'col-span-2 sm:col-span-1' } : {})}
            value={filters.sort}
            onChange={(v) => {
              set('sort', v as SortKey);
            }}
            options={[
              { value: 'smart', label: 'Atrasadas e prioridade' },
              { value: 'due', label: 'Prazo' },
              { value: 'priority', label: 'Prioridade' },
              { value: 'created', label: 'Mais recentes' },
              { value: 'title', label: 'Título (A–Z)' },
            ]}
          />
        </div>
        {!loading && !error && (
          <p className="text-body-sm text-fg-subtle" aria-live="polite">
            {pluralize(filtered.length, 'tarefa', 'tarefas')}
            {overdueCount > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  className="font-medium text-danger hover:underline"
                  onClick={() => {
                    setFilters({ ...DEFAULT_FILTERS, due: 'overdue' });
                  }}
                >
                  {pluralize(overdueCount, 'atrasada', 'atrasadas')}
                </button>
              </>
            )}
            {hasFilters && (
              <>
                {' · '}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                  }}
                >
                  Limpar filtros
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <ErrorState
          title="Não foi possível carregar as tarefas"
          description={errorMessage(error)}
          onRetry={() => {
            void tasksQuery.refetch();
            void depsQuery.refetch();
          }}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="size-6" />}
          title="Nenhuma tarefa ainda"
          description="Crie a primeira tarefa. Você pode dar prazo, prioridade, subtarefas e ligá-la a um projeto."
          action={
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDialog({ mode: 'create' });
              }}
            >
              Nova tarefa
            </Button>
          }
        />
      ) : view === 'kanban' ? (
        <TaskKanban
          tasks={filtered}
          allTasks={tasks}
          deps={deps}
          projects={projects}
          today={today}
          onOpen={(id) => {
            setDialog({ mode: 'view', taskId: id });
          }}
          onMove={(task, status) => {
            if (status === 'done') complete.request(task);
            else changeStatus.mutate({ task, status });
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma tarefa com esses filtros"
          description="Ajuste a busca ou os filtros para ver outras tarefas."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <TaskList
          visible={filtered}
          allTasks={tasks}
          deps={deps}
          projects={projects}
          today={today}
          busy={complete.pending || changeStatus.isPending}
          onOpen={(id) => {
            setDialog({ mode: 'view', taskId: id });
          }}
          onToggleDone={(task) => {
            if (task.status === 'done') changeStatus.mutate({ task, status: 'todo' });
            else complete.request(task);
          }}
        />
      )}

      {complete.dialog}
      <TaskDialog
        state={dialog}
        onChange={setDialog}
        tasks={tasks}
        deps={deps}
        projects={projects}
        categories={categories}
        today={today}
        timezone={timezone}
      />
    </div>
  );
}
