import { describe, expect, it } from 'vitest';
import { masteryFromAccuracy, nextInterval } from './reviews';

describe('regra de revisão (espelho de private.review_next_interval)', () => {
  // Mesma tabela verificada no pgTAP (05_phase3_rules.test.sql).
  it.each([
    [0, 1, 0, 1],
    [0, 2, 0, 1],
    [0, 3, 1, 3],
    [0, 4, 2, 7],
    [2, 2, 2, 7],
    [3, 3, 4, 30],
    [6, 4, 8, 240],
    [9, 3, 10, 240],
  ] as const)('repetições %i, nota %i → %i repetições, %i dias', (reps, grade, nextReps, days) => {
    expect(nextInterval(reps, grade)).toEqual({ repetitions: nextReps, days });
  });
});

describe('domínio a partir do aproveitamento', () => {
  it('faixas 50/70/90 %', () => {
    expect(masteryFromAccuracy(10, 4)).toBe(1);
    expect(masteryFromAccuracy(10, 5)).toBe(2);
    expect(masteryFromAccuracy(10, 8)).toBe(3);
    expect(masteryFromAccuracy(10, 9)).toBe(4);
    expect(masteryFromAccuracy(0, 0)).toBeNull();
  });
});
