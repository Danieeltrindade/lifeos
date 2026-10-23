import { describe, expect, it } from 'vitest';
import {
  canComplete,
  DEFAULT_FILTERS,
  filterTasks,
  isOverdue,
  pendingPrerequisites,
  punctuality,
  sortTasks,
  subtaskSummary,
  wouldCreateCycle,
  type Task,
  type TaskDependency,
} from './tasks';

let n = 0;
function task(overrides: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: `t${String(n)}`,
    user_id: 'u',
    project_id: null,
    parent_task_id: null,
    title: `Tarefa ${String(n)}`,
    notes: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_on: null,
    start_on: null,
    estimate_minutes: null,
    sort_order: 0,
    category_id: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    goal_id: null,
    created_at: `2026-10-0${String((n % 9) + 1)}T10:00:00Z`,
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

const dep = (taskId: string, dependsOn: string): TaskDependency => ({
  task_id: taskId,
  depends_on_task_id: dependsOn,
  user_id: 'u',
  created_at: '',
  updated_at: '',
});

const TODAY = '2026-10-21';

describe('atraso', () => {
  it('aberta com prazo passado está atrasada; concluída ou cancelada não', () => {
    expect(isOverdue(task({ due_on: '2026-10-20' }), TODAY)).toBe(true);
    expect(isOverdue(task({ due_on: '2026-10-21' }), TODAY)).toBe(false);
    expect(isOverdue(task({ due_on: '2026-10-20', status: 'done' }), TODAY)).toBe(false);
    expect(isOverdue(task({ due_on: '2026-10-20', status: 'cancelled' }), TODAY)).toBe(false);
  });
});

describe('filtros e ordenação', () => {
  const a = task({ title: 'Revisar cálculo', priority: 'low', due_on: '2026-10-19' });
  const b = task({ title: 'Ler artigo', priority: 'high', due_on: '2026-10-25', project_id: 'p1' });
  const c = task({ title: 'Entregar relatório', priority: 'high', status: 'done' });
  const d = task({ title: 'Planejar', priority: 'medium', status: 'cancelled' });
  const all = [a, b, c, d];

  it('padrão mostra só abertas', () => {
    expect(filterTasks(all, DEFAULT_FILTERS, TODAY)).toEqual([a, b]);
  });

  it('busca ignora acentos e maiúsculas', () => {
    expect(filterTasks(all, { ...DEFAULT_FILTERS, search: 'CALCULO' }, TODAY)).toEqual([a]);
  });

  it('filtra por status, prioridade, prazo e projeto', () => {
    expect(filterTasks(all, { ...DEFAULT_FILTERS, status: 'cancelled' }, TODAY)).toEqual([d]);
    expect(
      filterTasks(all, { ...DEFAULT_FILTERS, status: 'all', priority: 'high' }, TODAY),
    ).toEqual([b, c]);
    expect(filterTasks(all, { ...DEFAULT_FILTERS, due: 'overdue' }, TODAY)).toEqual([a]);
    expect(filterTasks(all, { ...DEFAULT_FILTERS, due: 'week' }, TODAY)).toEqual([b]);
    expect(filterTasks(all, { ...DEFAULT_FILTERS, project: 'p1' }, TODAY)).toEqual([b]);
    expect(filterTasks(all, { ...DEFAULT_FILTERS, project: 'none' }, TODAY)).toEqual([a]);
  });

  it('ordem inteligente: atrasadas primeiro, depois prioridade', () => {
    expect(sortTasks([b, a], 'smart', TODAY).map((t) => t.id)).toEqual([a.id, b.id]);
    expect(sortTasks([a, b], 'priority', TODAY).map((t) => t.id)).toEqual([b.id, a.id]);
    expect(sortTasks([b, a], 'due', TODAY).map((t) => t.id)).toEqual([a.id, b.id]);
  });
});

describe('subtarefas e dependências', () => {
  it('resumo de subtarefas separa concluídas, abertas e canceladas', () => {
    const parent = task();
    const subs = [
      task({ parent_task_id: parent.id, status: 'done' }),
      task({ parent_task_id: parent.id }),
      task({ parent_task_id: parent.id, status: 'cancelled' }),
    ];
    expect(subtaskSummary(parent.id, [parent, ...subs])).toEqual({
      total: 3,
      done: 1,
      open: 1,
      cancelled: 1,
    });
    expect(canComplete(parent, [parent, ...subs], [])).toEqual({
      ok: false,
      reason: 'subtasks',
      open: 1,
    });
  });

  it('concluir todas as subtarefas não conclui a mãe (apenas libera)', () => {
    const parent = task();
    const sub = task({ parent_task_id: parent.id, status: 'done' });
    expect(canComplete(parent, [parent, sub], [])).toEqual({ ok: true });
    expect(parent.status).toBe('todo');
  });

  it('pré-requisito aberto bloqueia; concluído ou cancelado libera', () => {
    const first = task();
    const second = task();
    const deps = [dep(second.id, first.id)];
    expect(pendingPrerequisites(second.id, deps, [first, second])).toEqual([first]);
    expect(canComplete(second, [first, second], deps)).toMatchObject({ reason: 'dependencies' });
    const doneFirst = { ...first, status: 'cancelled' };
    expect(canComplete(second, [doneFirst, second], deps)).toEqual({ ok: true });
  });

  it('detecta ciclos diretos e indiretos', () => {
    const deps = [dep('b', 'a'), dep('c', 'b')];
    expect(wouldCreateCycle('a', 'c', deps)).toBe(true);
    expect(wouldCreateCycle('a', 'b', deps)).toBe(true);
    expect(wouldCreateCycle('c', 'a', deps)).toBe(false);
    expect(wouldCreateCycle('a', 'a', [])).toBe(true);
  });
});

describe('pontualidade (para análise)', () => {
  it('compara a data local de conclusão com o prazo', () => {
    const t = task({ status: 'done', due_on: '2026-10-20', completed_at: '2026-10-21T01:00:00Z' });
    expect(punctuality(t, '2026-10-20')).toBe('on_time');
    expect(punctuality(t, '2026-10-21')).toBe('late');
    expect(punctuality(task({ status: 'done' }), '2026-10-21')).toBe('no_due');
    expect(punctuality(task(), null)).toBeNull();
  });
});
