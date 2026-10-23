import { describe, expect, it } from 'vitest';
import { isProjectOverdue, projectProgress } from './projects';

describe('progresso do projeto', () => {
  it('concluídas ÷ (total − canceladas), subtarefas incluídas', () => {
    const tasks = [
      { project_id: 'p', status: 'done' },
      { project_id: 'p', status: 'done' },
      { project_id: 'p', status: 'todo' },
      { project_id: 'p', status: 'in_progress' },
      { project_id: 'p', status: 'cancelled' },
      { project_id: 'outro', status: 'done' },
    ];
    expect(projectProgress('p', tasks)).toEqual({
      done: 2,
      total: 4,
      open: 2,
      cancelled: 1,
      ratio: 0.5,
    });
  });

  it('sem tarefas válidas o progresso é desconhecido, não 0 %', () => {
    expect(projectProgress('p', [{ project_id: 'p', status: 'cancelled' }]).ratio).toBeNull();
    expect(projectProgress('p', []).ratio).toBeNull();
  });

  it('atraso só para projetos em aberto', () => {
    expect(isProjectOverdue({ status: 'active', due_on: '2026-10-01' }, '2026-10-21')).toBe(true);
    expect(isProjectOverdue({ status: 'completed', due_on: '2026-10-01' }, '2026-10-21')).toBe(
      false,
    );
  });
});
