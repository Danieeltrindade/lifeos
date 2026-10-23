import { describe, expect, it } from 'vitest';
import {
  change,
  dailyTotals,
  describeChange,
  describeRateChange,
  estimateAccuracy,
  formatSeconds,
  mean,
  median,
  onTimeRate,
  safeRate,
} from './metrics';
import { consistencyInRange } from './habit-stats';
import { goalCycleSummary } from './goal-stats';

describe('sem divisão por zero', () => {
  it('safeRate devolve null quando a base é 0 ou inválida', () => {
    expect(safeRate(3, 4)).toBe(0.75);
    expect(safeRate(3, 0)).toBeNull();
    expect(safeRate(0, 0)).toBeNull();
    expect(safeRate(Number.NaN, 2)).toBeNull();
    expect(safeRate(1, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('média e mediana de lista vazia são null', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(mean([1, 2, 6])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('change (comparação entre períodos)', () => {
  it('anterior 0: sem percentual enganoso', () => {
    expect(change(120, 0)).toMatchObject({ pct: null, kind: 'new', delta: 120 });
    expect(change(0, 0)).toMatchObject({ pct: null, kind: 'none' });
    expect(describeChange(change(120, 0), String)).toBe(
      'sem base no período anterior (antes: 0; agora: 120)',
    );
  });

  it('aumento, queda e igualdade', () => {
    expect(change(150, 100)).toMatchObject({ pct: 0.5, kind: 'up' });
    expect(change(50, 100)).toMatchObject({ pct: -0.5, kind: 'down' });
    expect(change(100, 100).kind).toBe('same');
    expect(describeChange(change(150, 100), (v) => `${String(v)} min`)).toBe('+50% (+50 min)');
    expect(describeChange(change(50, 100), (v) => `${String(v)} min`)).toBe('-50% (−50 min)');
  });
});

describe('dailyTotals (valores ausentes e dias futuros)', () => {
  const days = [
    { date: '2026-10-19', value: 3600 },
    { date: '2026-10-20', value: 0 },
    { date: '2026-10-21', value: 1800 },
    { date: '2026-10-22', value: 0 },
    { date: '2026-10-23', value: 0 },
  ];

  it('média por dia transcorrido inclui dias sem registro, mas não dias futuros', () => {
    const t = dailyTotals(days, '2026-10-22');
    expect(t).toEqual({
      total: 5400,
      elapsedDays: 4,
      activeDays: 2,
      perDay: 1350,
      perActiveDay: 2700,
    });
  });

  it('sem registro algum: médias nulas por dia ativo', () => {
    const t = dailyTotals(
      days.map((d) => ({ ...d, value: 0 })),
      '2026-10-22',
    );
    expect(t.perActiveDay).toBeNull();
    expect(t.perDay).toBe(0);
  });

  it('período todo no futuro: nada transcorrido', () => {
    expect(dailyTotals(days, '2026-10-01')).toMatchObject({ elapsedDays: 0, perDay: null });
  });
});

describe('estimado × realizado', () => {
  it('tarefas sem tempo registrado não entram na precisão', () => {
    const a = estimateAccuracy([
      { taskId: 'a', estimateMinutes: 60, actualSeconds: 5400 }, // 1,5×
      { taskId: 'b', estimateMinutes: 30, actualSeconds: 1800 }, // 1×
      { taskId: 'c', estimateMinutes: 45, actualSeconds: 0 }, // sem tempo
      { taskId: 'd', estimateMinutes: 0, actualSeconds: 600 }, // estimativa inválida
    ]);
    expect(a).toMatchObject({
      withEstimate: 3,
      withTime: 2,
      withoutTime: 1,
      medianRatio: 1.25,
      withinTolerance: 0.5,
      totalEstimateMinutes: 90,
      totalActualMinutes: 120,
    });
  });

  it('sem base: null', () => {
    expect(estimateAccuracy([]).medianRatio).toBeNull();
    expect(estimateAccuracy([]).withinTolerance).toBeNull();
  });
});

describe('cumprimento de prazos', () => {
  it('abertas ainda no prazo e canceladas não entram na base', () => {
    expect(
      onTimeRate({ total: 6, cancelled: 1, doneOnTime: 2, doneLate: 1, open: 2, openOverdue: 1 }),
    ).toBeCloseTo(2 / 4);
    expect(
      onTimeRate({ total: 1, cancelled: 1, doneOnTime: 0, doneLate: 0, open: 0, openOverdue: 0 }),
    ).toBeNull();
  });
});

describe('formatSeconds', () => {
  it('arredonda para minutos', () => {
    expect(formatSeconds(0)).toBe('0 min');
    expect(formatSeconds(2700)).toBe('45 min');
    expect(formatSeconds(7500)).toBe('2 h 05 min');
    expect(formatSeconds(7200)).toBe('2 h');
  });
});

describe('consistência de hábito num período', () => {
  const daily = {
    scheduleKind: 'daily' as const,
    weekdays: null,
    timesPerWeek: null,
    targetValue: null,
    startOn: '2026-10-01',
  };

  it('conta só dias elegíveis até hoje; hoje só conta se cumprido', () => {
    const c = consistencyInRange(
      daily,
      [
        { localDate: '2026-10-19', value: null },
        { localDate: '2026-10-21', value: null },
      ],
      '2026-10-19',
      '2026-10-26',
      '2026-10-22',
      1,
    );
    // 19, 20, 21 elegíveis (22 = hoje, não cumprido, fica de fora).
    expect(c).toEqual({ eligible: 3, met: 2, rate: 2 / 3, unit: 'days' });
  });

  it('antes do início do hábito não há base', () => {
    const c = consistencyInRange(daily, [], '2026-09-01', '2026-09-08', '2026-10-22', 1);
    expect(c).toEqual({ eligible: 0, met: 0, rate: null, unit: 'days' });
  });

  it('meta por marcação: valor abaixo da meta não conta', () => {
    const c = consistencyInRange(
      { ...daily, targetValue: 20 },
      [
        { localDate: '2026-10-19', value: 25 },
        { localDate: '2026-10-20', value: 10 },
      ],
      '2026-10-19',
      '2026-10-21',
      '2026-10-22',
      1,
    );
    expect(c).toMatchObject({ eligible: 2, met: 1 });
  });

  it('modo semanal: semana em andamento só conta se já cumprida', () => {
    const weekly = { ...daily, scheduleKind: 'times_per_week' as const, timesPerWeek: 2 };
    const c = consistencyInRange(
      weekly,
      [
        { localDate: '2026-10-12', value: null },
        { localDate: '2026-10-14', value: null },
        { localDate: '2026-10-20', value: null },
      ],
      '2026-10-12',
      '2026-10-26',
      '2026-10-22',
      1,
    );
    expect(c).toEqual({ eligible: 1, met: 1, rate: 1, unit: 'weeks' });
  });
});

describe('ciclos de metas', () => {
  it('só ciclos encerrados entram na taxa; alvo de cada ciclo é o da época', () => {
    const s = goalCycleSummary({
      cycles: [
        { start: '2026-08-31', end: '2026-09-07', value: 3.58, target: 2, complete: true },
        { start: '2026-09-07', end: '2026-09-14', value: 4, target: 5, complete: true },
        { start: '2026-09-14', end: '2026-09-21', value: 9, target: 5, complete: false },
      ],
    });
    expect(s).toMatchObject({ finished: 2, met: 1, rate: 0.5 });
    expect(s.open?.start).toBe('2026-09-14');
  });

  it('nenhum ciclo encerrado: taxa nula', () => {
    expect(goalCycleSummary({ cycles: [] }).rate).toBeNull();
  });
});

describe('variação de taxas em pontos percentuais', () => {
  it('usa diferença absoluta, não relativa', () => {
    expect(describeRateChange(0.5, 0.4)).toBe('+10 p.p. (antes: 40%)');
    expect(describeRateChange(0.25, 0.75)).toBe('−50 p.p. (antes: 75%)');
    expect(describeRateChange(0.6, 0.6)).toBe('igual ao período anterior (60%)');
  });

  it('sem base em um dos períodos não inventa número', () => {
    expect(describeRateChange(0.5, null)).toBe('sem base no período anterior');
    expect(describeRateChange(null, 0.3)).toBe('sem base agora (antes: 30%)');
    expect(describeRateChange(null, null)).toBe('sem base nos dois períodos');
  });
});
