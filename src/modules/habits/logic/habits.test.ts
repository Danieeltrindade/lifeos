import { describe, expect, it } from 'vitest';
import {
  computeConsistency,
  computeStreak,
  dayState,
  isDueToday,
  isEligibleDay,
  isMet,
  weekProgress,
  type Checkin,
  type HabitRule,
} from './habits';

const daily: HabitRule = {
  scheduleKind: 'daily',
  weekdays: null,
  timesPerWeek: null,
  targetValue: null,
  startOn: '2026-10-01',
};
// Seg, qua e sex.
const mwf: HabitRule = { ...daily, scheduleKind: 'weekdays', weekdays: [1, 3, 5] };
const thrice: HabitRule = { ...daily, scheduleKind: 'times_per_week', timesPerWeek: 3 };

const c = (...dates: string[]): Checkin[] => dates.map((localDate) => ({ localDate, value: null }));

describe('marcação cumprida', () => {
  it('sem meta: qualquer marcação conta', () => {
    expect(isMet(daily, { localDate: '2026-10-01', value: null })).toBe(true);
  });
  it('com meta: só conta quando atinge o valor', () => {
    const reading = { ...daily, targetValue: 20 };
    expect(isMet(reading, { localDate: '2026-10-01', value: 19 })).toBe(false);
    expect(isMet(reading, { localDate: '2026-10-01', value: 20 })).toBe(true);
  });
});

describe('dias elegíveis', () => {
  it('dias da semana: terça não é elegível para seg/qua/sex', () => {
    expect(isEligibleDay(mwf, '2026-10-19')).toBe(true); // segunda
    expect(isEligibleDay(mwf, '2026-10-20')).toBe(false); // terça
  });
  it('antes do início nada é elegível', () => {
    expect(isEligibleDay(daily, '2026-09-30')).toBe(false);
  });
});

describe('sequência', () => {
  it('diária: hoje ainda não marcado não quebra a sequência', () => {
    const s = computeStreak(daily, c('2026-10-18', '2026-10-19', '2026-10-20'), '2026-10-21', 1);
    expect(s).toEqual({ current: 3, best: 3, unit: 'days' });
  });

  it('diária: um dia perdido zera a sequência atual, mas preserva a melhor', () => {
    const s = computeStreak(
      daily,
      c('2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-15', '2026-10-21'),
      '2026-10-21',
      1,
    );
    expect(s.current).toBe(1);
    expect(s.best).toBe(4);
  });

  it('seg/qua/sex: terças e quintas sem marcação não penalizam', () => {
    // Semana de 12/10: seg 12, qua 14, sex 16; seg 19.
    const s = computeStreak(
      mwf,
      c('2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19'),
      '2026-10-20', // terça
      1,
    );
    expect(s.current).toBe(4);
  });

  it('seg/qua/sex: faltar numa quarta quebra', () => {
    const s = computeStreak(mwf, c('2026-10-12', '2026-10-16', '2026-10-19'), '2026-10-20', 1);
    expect(s.current).toBe(2);
  });

  it('3× por semana conta semanas cumpridas; semana atual em andamento não quebra', () => {
    const checkins = c(
      '2026-10-05',
      '2026-10-07',
      '2026-10-09', // semana 05/10: 3 ✓
      '2026-10-13',
      '2026-10-14',
      '2026-10-17', // semana 12/10: 3 ✓
      '2026-10-20', // semana 19/10: 1 (em andamento)
    );
    const s = computeStreak(thrice, checkins, '2026-10-21', 1);
    expect(s).toEqual({ current: 2, best: 2, unit: 'weeks' });
    expect(weekProgress(thrice, checkins, '2026-10-21', 1)).toEqual({
      weekStart: '2026-10-19',
      done: 1,
      target: 3,
    });
  });

  it('início da semana muda o agrupamento (domingo)', () => {
    // 18/10 é domingo: com semana começando no domingo, 18–20 formam uma semana completa.
    const checkins = c('2026-10-18', '2026-10-19', '2026-10-20');
    expect(weekProgress(thrice, checkins, '2026-10-20', 0).done).toBe(3);
    expect(weekProgress(thrice, checkins, '2026-10-20', 1).done).toBe(2);
  });

  it('marcação abaixo da meta não conta na sequência', () => {
    const reading = { ...daily, targetValue: 20 };
    const s = computeStreak(
      reading,
      [
        { localDate: '2026-10-19', value: 25 },
        { localDate: '2026-10-20', value: 5 },
      ],
      '2026-10-21',
      1,
    );
    expect(s.current).toBe(0);
  });
});

describe('consistência', () => {
  it('cumpridos ÷ elegíveis, sem contar hoje enquanto pendente', () => {
    // 7 dias: 15..21; hoje (21) pendente → 6 elegíveis; 4 cumpridos.
    const r = computeConsistency(
      daily,
      c('2026-10-15', '2026-10-16', '2026-10-18', '2026-10-20'),
      '2026-10-21',
      7,
      1,
    );
    expect(r).toEqual({ eligible: 6, met: 4, rate: 4 / 6 });
  });

  it('seg/qua/sex numa semana: só 3 dias elegíveis', () => {
    const r = computeConsistency(mwf, c('2026-10-12', '2026-10-16'), '2026-10-18', 7, 1);
    expect(r).toMatchObject({ eligible: 3, met: 2 });
  });

  it('sem período elegível, a taxa é desconhecida (não 0 %)', () => {
    const future = { ...daily, startOn: '2026-11-01' };
    expect(computeConsistency(future, [], '2026-10-21', 30, 1).rate).toBeNull();
  });
});

describe('grade e "hoje"', () => {
  it('estados de cada dia', () => {
    const reading = { ...mwf, targetValue: 10 };
    expect(dayState(reading, undefined, '2026-10-20', '2026-10-21')).toBe('not_eligible');
    expect(dayState(reading, undefined, '2026-10-19', '2026-10-21')).toBe('missed');
    expect(
      dayState(reading, { localDate: '2026-10-21', value: 3 }, '2026-10-21', '2026-10-21'),
    ).toBe('partial');
    expect(dayState(reading, undefined, '2026-10-21', '2026-10-21')).toBe('pending');
    expect(dayState(reading, undefined, '2026-10-23', '2026-10-21')).toBe('future');
    expect(dayState(thrice, undefined, '2026-10-20', '2026-10-21')).toBe('open');
  });

  it('semanal sai de "hoje" quando a meta da semana foi cumprida', () => {
    const done = c('2026-10-19', '2026-10-20', '2026-10-21');
    expect(isDueToday(thrice, done.slice(0, 2), '2026-10-22', 1)).toBe(true);
    expect(isDueToday(thrice, done, '2026-10-22', 1)).toBe(false);
  });
});
