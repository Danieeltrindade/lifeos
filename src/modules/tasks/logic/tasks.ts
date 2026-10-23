/**
 * Regras de tarefas do lado da interface (docs/data-model.md §9.2). O BANCO é a autoridade
 * (gatilhos recusam concluir com dependência ou subtarefa aberta); estas funções servem para
 * explicar ANTES de tentar, filtrar, ordenar e calcular indicadores.
 */
import type { ISODate } from '@/lib/date';
import { daysBetween } from '@/lib/date';
import { matchesSearch } from '@/lib/text';
import type { Tables } from '@/services/supabase/database.types';

export type Task = Tables<'tasks'>;
export type TaskDependency = Tables<'task_dependencies'>;
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function isOpen(task: Pick<Task, 'status'>): boolean {
  return task.status === 'todo' || task.status === 'in_progress';
}

/** Atrasada: aberta e com prazo antes de hoje. Só um DESTAQUE — o status não muda. */
export function isOverdue(task: Pick<Task, 'status' | 'due_on'>, today: ISODate): boolean {
  return isOpen(task) && task.due_on !== null && task.due_on < today;
}

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export function matchesDue(task: Task, filter: DueFilter, today: ISODate): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'overdue':
      return isOverdue(task, today);
    case 'today':
      return task.due_on === today;
    case 'week':
      return task.due_on !== null && task.due_on >= today && daysBetween(task.due_on, today) < 7;
    case 'none':
      return task.due_on === null;
  }
}

export type StatusFilter = 'open' | 'all' | TaskStatus;
export type SortKey = 'smart' | 'due' | 'priority' | 'created' | 'title';

export interface TaskFilters {
  search: string;
  status: StatusFilter;
  priority: 'all' | Priority;
  due: DueFilter;
  /** 'all', 'none' (sem projeto) ou o id do projeto. */
  project: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: TaskFilters = {
  search: '',
  status: 'open',
  priority: 'all',
  due: 'all',
  project: 'all',
  sort: 'smart',
};

export function filterTasks(tasks: readonly Task[], f: TaskFilters, today: ISODate): Task[] {
  return tasks.filter((t) => {
    if (f.status === 'open' ? !isOpen(t) : f.status !== 'all' && t.status !== f.status)
      return false;
    if (f.priority !== 'all' && t.priority !== f.priority) return false;
    if (!matchesDue(t, f.due, today)) return false;
    if (
      f.project === 'none'
        ? t.project_id !== null
        : f.project !== 'all' && t.project_id !== f.project
    ) {
      return false;
    }
    return matchesSearch(f.search, t.title, t.description, t.notes);
  });
}

function byDue(a: Task, b: Task): number {
  if (a.due_on === b.due_on) return 0;
  if (a.due_on === null) return 1;
  if (b.due_on === null) return -1;
  return a.due_on < b.due_on ? -1 : 1;
}

function byPriority(a: Task, b: Task): number {
  return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
}

/**
 * "smart": atrasadas primeiro, depois prioridade e prazo (mesma ordem do dashboard).
 */
export function sortTasks(tasks: readonly Task[], sort: SortKey, today: ISODate): Task[] {
  const list = [...tasks];
  const created = (a: Task, b: Task) => (a.created_at < b.created_at ? -1 : 1);
  switch (sort) {
    case 'smart':
      return list.sort(
        (a, b) =>
          Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
          byPriority(a, b) ||
          byDue(a, b) ||
          created(a, b),
      );
    case 'due':
      return list.sort((a, b) => byDue(a, b) || byPriority(a, b));
    case 'priority':
      return list.sort((a, b) => byPriority(a, b) || byDue(a, b));
    case 'created':
      return list.sort((a, b) => -created(a, b));
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  }
}

export interface SubtaskSummary {
  total: number;
  done: number;
  open: number;
  cancelled: number;
}

export function subtaskSummary(parentId: string, tasks: readonly Task[]): SubtaskSummary {
  const subs = tasks.filter((t) => t.parent_task_id === parentId);
  return {
    total: subs.length,
    done: subs.filter((t) => t.status === 'done').length,
    open: subs.filter(isOpen).length,
    cancelled: subs.filter((t) => t.status === 'cancelled').length,
  };
}

/** Pré-requisitos ainda abertos (impedem concluir). */
export function pendingPrerequisites(
  taskId: string,
  deps: readonly TaskDependency[],
  tasks: readonly Task[],
): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return deps
    .filter((d) => d.task_id === taskId)
    .map((d) => byId.get(d.depends_on_task_id))
    .filter((t): t is Task => t !== undefined && isOpen(t));
}

/** Tarefas que dependem desta (seriam liberadas ao concluí-la). */
export function dependents(
  taskId: string,
  deps: readonly TaskDependency[],
  tasks: readonly Task[],
): Task[] {
  const ids = new Set(deps.filter((d) => d.depends_on_task_id === taskId).map((d) => d.task_id));
  return tasks.filter((t) => ids.has(t.id));
}

/**
 * Adicionar "taskId depende de dependsOnId" criaria um ciclo? Verdadeiro se dependsOnId já
 * depende (direta ou indiretamente) de taskId. O banco também recusa; aqui evitamos oferecer.
 */
export function wouldCreateCycle(
  taskId: string,
  dependsOnId: string,
  deps: readonly TaskDependency[],
): boolean {
  if (taskId === dependsOnId) return true;
  const edges = new Map<string, string[]>();
  for (const d of deps)
    edges.set(d.task_id, [...(edges.get(d.task_id) ?? []), d.depends_on_task_id]);
  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    if (current === taskId) return true;
    seen.add(current);
    stack.push(...(edges.get(current) ?? []));
  }
  return false;
}

export type CompletionCheck =
  | { ok: true }
  | { ok: false; reason: 'dependencies'; blockers: Task[] }
  | { ok: false; reason: 'subtasks'; open: number };

export function canComplete(
  task: Task,
  tasks: readonly Task[],
  deps: readonly TaskDependency[],
): CompletionCheck {
  const blockers = pendingPrerequisites(task.id, deps, tasks);
  if (blockers.length > 0) return { ok: false, reason: 'dependencies', blockers };
  const subs = subtaskSummary(task.id, tasks);
  if (subs.open > 0) return { ok: false, reason: 'subtasks', open: subs.open };
  return { ok: true };
}

export type Punctuality = 'on_time' | 'late' | 'no_due';

/**
 * Pontualidade de uma tarefa concluída: compara a DATA LOCAL da conclusão com o prazo.
 * Registrada para a análise de execução (Fase 7); null enquanto não concluída.
 */
export function punctuality(task: Task, completedLocalDate: ISODate | null): Punctuality | null {
  if (task.status !== 'done' || !completedLocalDate) return null;
  if (!task.due_on) return 'no_due';
  return completedLocalDate <= task.due_on ? 'on_time' : 'late';
}

/** Minutos estimados formatados; estimativa ≠ tempo real (RN-02). */
export function estimateLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${String(m)} min`;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m)} min`;
}
