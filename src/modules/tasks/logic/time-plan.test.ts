import { describe, expect, it } from 'vitest';
import { taskTimePlan } from './time-plan';

const now = new Date('2026-10-22T15:00:00Z');

describe('taskTimePlan', () => {
  it('separa estimado, planejado (passado e futuro) e realizado', () => {
    const p = taskTimePlan({
      estimateMinutes: 120,
      actualSeconds: 90 * 60,
      blocks: [
        { start: '2026-10-21T13:00:00Z', end: '2026-10-21T14:00:00Z' },
        { start: '2026-10-22T14:30:00Z', end: '2026-10-22T15:30:00Z' }, // metade no futuro
      ],
      now,
    });
    expect(p).toEqual({
      estimatedMinutes: 120,
      plannedMinutes: 120,
      plannedFutureMinutes: 30,
      actualMinutes: 90,
      diffMinutes: -30,
      diffRate: -0.25,
      remainingMinutes: 30,
    });
  });

  it('sem estimativa: diferença indefinida (nunca dividir por zero)', () => {
    const p = taskTimePlan({ estimateMinutes: null, actualSeconds: 600, blocks: [], now });
    expect(p).toMatchObject({
      diffMinutes: null,
      diffRate: null,
      remainingMinutes: null,
      actualMinutes: 10,
    });
    expect(
      taskTimePlan({ estimateMinutes: 0, actualSeconds: 0, blocks: [], now }).diffRate,
    ).toBeNull();
  });

  it('realizado acima do estimado: restante 0, diferença positiva', () => {
    const p = taskTimePlan({ estimateMinutes: 30, actualSeconds: 45 * 60, blocks: [], now });
    expect(p).toMatchObject({ diffMinutes: 15, diffRate: 0.5, remainingMinutes: 0 });
  });

  it('ignora blocos inválidos', () => {
    expect(
      taskTimePlan({
        estimateMinutes: 30,
        actualSeconds: 0,
        blocks: [{ start: '2026-10-22T10:00:00Z', end: '2026-10-22T10:00:00Z' }],
        now,
      }).plannedMinutes,
    ).toBe(0);
  });
});
