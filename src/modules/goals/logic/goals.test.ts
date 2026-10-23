import { describe, expect, it } from 'vitest';
import { formatGoalValue, goalRatio } from './goals';

describe('formatGoalValue', () => {
  it('concorda a unidade com o número', () => {
    expect(formatGoalValue(1, 'sessões')).toBe('1 sessão');
    expect(formatGoalValue(2, 'sessões')).toBe('2 sessões');
    expect(formatGoalValue(0, 'questões')).toBe('0 questões');
    expect(formatGoalValue(1, 'vezes')).toBe('1 vez');
    expect(formatGoalValue(1, 'km')).toBe('1 km');
  });

  it('horas fracionárias viram h e min', () => {
    expect(formatGoalValue(1.5, 'h')).toBe('1 h 30 min');
    expect(formatGoalValue(0.25, 'h')).toBe('15 min');
    expect(formatGoalValue(2, 'h')).toBe('2 h');
  });
});

describe('goalRatio', () => {
  it('sem alvo válido não há proporção', () => {
    expect(goalRatio(3, 0)).toBe(0);
    expect(goalRatio(5, 10)).toBe(0.5);
  });
});
