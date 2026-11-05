import { describe, expect, it } from 'vitest';
import { affectedDomains } from './domains';

describe('affectedDomains', () => {
  it('concluir uma tarefa atualiza projetos, metas, calendário e dashboard', () => {
    expect(affectedDomains(['tasks']).sort()).toEqual(
      ['calendar', 'dashboard', 'goals', 'projects', 'stats', 'tasks'].sort(),
    );
  });

  it('as notas não invalidam estatísticas', () => {
    expect(affectedDomains(['notes'])).toEqual(['notes']);
  });

  it('toda mudança relevante chega ao dashboard', () => {
    for (const d of ['tasks', 'sessions', 'habits', 'goals', 'activities', 'calendar'] as const) {
      expect(affectedDomains([d])).toContain('dashboard');
    }
  });

  it('exclusões e correções retroativas recalculam as estatísticas', () => {
    for (const d of [
      'tasks',
      'projects',
      'subjects',
      'sessions',
      'reviews',
      'activities',
      'goals',
      'habits',
      'calendar',
      'categories',
    ] as const) {
      expect(affectedDomains([d])).toContain('stats');
    }
  });
});
