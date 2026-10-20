import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, formatDuration, greetingFor, relativeDayLabel } from './date';

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [85, '1 h 25 min'],
    [-5, '0 min'],
  ])('%i minutos → "%s"', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe('greetingFor', () => {
  const at = (h: number) => new Date(2026, 9, 20, h, 0);
  it('respeita as faixas do dia', () => {
    expect(greetingFor(at(4))).toBe('Boa noite');
    expect(greetingFor(at(5))).toBe('Bom dia');
    expect(greetingFor(at(12))).toBe('Boa tarde');
    expect(greetingFor(at(18))).toBe('Boa noite');
  });
});

describe('dias de calendário', () => {
  const now = new Date(2026, 9, 20, 23, 30);
  it('compara dias locais, não intervalos de 24 h', () => {
    expect(calendarDaysBetween(new Date(2026, 9, 21, 0, 10), now)).toBe(1);
  });
  it('gera rótulos relativos', () => {
    expect(relativeDayLabel(new Date(2026, 9, 20, 8).toISOString(), now)).toBe('Hoje');
    expect(relativeDayLabel(new Date(2026, 9, 21, 8).toISOString(), now)).toBe('Amanhã');
    expect(relativeDayLabel(new Date(2026, 9, 17, 8).toISOString(), now)).toBe('Há 3 dias');
  });
});
