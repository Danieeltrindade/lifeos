import { describe, expect, it } from 'vitest';
import { goalsCountingActivity, totalsByKind, type Activity } from './activities';

const goal = (overrides: Record<string, unknown>) => ({
  id: 'g',
  title: 'Meta',
  progress_mode: 'activity_time',
  subject_id: null,
  project_id: null,
  activity_category_id: null,
  activity_kind: null,
  status: 'active',
  archived_at: null,
  ...overrides,
});

const activity = {
  kind: 'exercise',
  subject_id: null,
  category_id: 'c1',
  project_id: null,
  task_id: null,
  pages: null,
};

describe('metas que contam a atividade', () => {
  it('filtra por tipo, categoria e matéria como o banco', () => {
    const goals = [
      goal({ id: 'all' }),
      goal({ id: 'exercise', activity_kind: 'exercise' }),
      goal({ id: 'reading', activity_kind: 'reading' }),
      goal({ id: 'cat', activity_category_id: 'c1' }),
      goal({ id: 'subject', subject_id: 's1' }),
      goal({ id: 'archived', archived_at: '2026-01-01' }),
      goal({ id: 'manual', progress_mode: 'manual' }),
    ];
    expect(goalsCountingActivity(goals, activity, null).map((g) => g.id)).toEqual([
      'all',
      'exercise',
      'cat',
    ]);
  });

  it('meta de projeto conta atividades ligadas a tarefas do projeto', () => {
    const goals = [goal({ id: 'p', project_id: 'p1' })];
    expect(goalsCountingActivity(goals, { ...activity, task_id: 't1' }, 'p1')).toHaveLength(1);
    expect(goalsCountingActivity(goals, activity, null)).toHaveLength(0);
  });

  it('meta de páginas só conta leitura com páginas', () => {
    const goals = [goal({ id: 'pages', progress_mode: 'pages' })];
    expect(
      goalsCountingActivity(goals, { ...activity, kind: 'reading', pages: 20 }, null),
    ).toHaveLength(1);
    expect(
      goalsCountingActivity(goals, { ...activity, kind: 'reading', pages: null }, null),
    ).toHaveLength(0);
  });
});

describe('totais por tipo', () => {
  it('soma duração e contagem', () => {
    const rows = [
      { kind: 'study', duration_seconds: 3600 },
      { kind: 'study', duration_seconds: 1800 },
      { kind: 'exercise', duration_seconds: 600 },
    ] as Activity[];
    expect(totalsByKind(rows)).toEqual([
      { kind: 'study', seconds: 5400, count: 2 },
      { kind: 'exercise', seconds: 600, count: 1 },
    ]);
  });
});
