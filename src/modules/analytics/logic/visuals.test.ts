import { describe, expect, it } from 'vitest';
import type { HabitRule } from '@/modules/habits/logic/habits';
import {
  bestSlot,
  goalPace,
  habitYear,
  heatLevel,
  hourHeatmap,
  secondsByDayAndKey,
  splitByLocalHour,
} from './visuals';

const SP = 'America/Sao_Paulo';

describe('splitByLocalHour', () => {
  it('reparte pelas horas locais e conserva o tempo líquido', () => {
    // 22h30 → 00h30 em São Paulo (UTC−3), 90 min líquidos em 120 brutos.
    const slices = splitByLocalHour(
      {
        started_at: '2026-11-03T01:30:00Z',
        ended_at: '2026-11-03T03:30:00Z',
        duration_seconds: 90 * 60,
      },
      SP,
    );
    expect(slices.map((s) => [s.date, s.hour])).toEqual([
      ['2026-11-02', 22],
      ['2026-11-02', 23],
      ['2026-11-03', 0],
    ]);
    const total = slices.reduce((a, s) => a + s.seconds, 0);
    expect(total).toBeCloseTo(90 * 60);
    expect(slices[1]?.seconds).toBeCloseTo(45 * 60);
  });

  it('ignora registros vazios ou invertidos', () => {
    expect(
      splitByLocalHour(
        {
          started_at: '2026-11-03T03:00:00Z',
          ended_at: '2026-11-03T02:00:00Z',
          duration_seconds: 60,
        },
        SP,
      ),
    ).toEqual([]);
  });

  it('agrega por dia e chave dentro do período', () => {
    const days = secondsByDayAndKey(
      [
        {
          started_at: '2026-11-03T02:00:00Z',
          ended_at: '2026-11-03T04:00:00Z',
          duration_seconds: 7200,
          kind: 'study',
        },
      ],
      (r) => r.kind,
      SP,
      '2026-11-02',
      '2026-11-03',
    );
    // Só a parte de 23h às 00h do dia 02 (1 h); a do dia 03 fica fora do período.
    expect(days.get('2026-11-02')?.get('study')).toBeCloseTo(3600);
    expect(days.has('2026-11-03')).toBe(false);
  });
});

describe('mapa de calor', () => {
  // Terças e quintas, 19h–21h locais, em 2 semanas.
  const rec = (date: string) => ({
    started_at: `${date}T22:00:00Z`,
    ended_at: `${date}T24:00:00Z`.replace('T24:00:00Z', 'T23:59:59Z'),
    duration_seconds: 7199,
  });
  const records = ['2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29'].map(rec);
  const h = hourHeatmap(records, SP, '2026-10-19', '2026-11-02', 1);

  it('média por semana na ordem da semana do perfil', () => {
    expect(h.weeks).toBe(2);
    expect(h.rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    const tuesday = h.rows.find((r) => r.weekday === 2);
    expect(tuesday?.hours[19]).toBeCloseTo(3600, -1);
    expect(tuesday?.hours[20]).toBeCloseTo(3599, -1);
  });

  it('melhor horário junta dias parecidos', () => {
    const best = bestSlot(h);
    expect(best?.weekdays).toEqual([2, 4]);
    expect(best?.text).toBe('terça e quinta, das 19h às 21h');
  });

  it('sem dados suficientes não conclui nada', () => {
    expect(
      bestSlot(hourHeatmap(records.slice(0, 1), SP, '2026-10-19', '2026-11-02', 1)),
    ).toBeNull();
  });

  it('níveis', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(4, 10)).toBe(2);
    expect(heatLevel(6, 10)).toBe(3);
    expect(heatLevel(10, 10)).toBe(4);
  });
});

describe('ritmo de metas', () => {
  // Ciclo semanal seg 02/11 a dom 08/11 (fim exclusivo 09/11), alvo 6 h, hoje quinta.
  const cycle = { start: '2026-11-02', end: '2026-11-09', target: 6 };
  it('adiantado e projeção', () => {
    const p = goalPace({ ...cycle, value: 5 }, '2026-11-05');
    expect(p.state).toBe('ahead');
    expect(p.expected).toBeCloseTo((6 * 4) / 7);
    expect(p.projected).toBeCloseTo((5 / 4) * 7);
    expect(p.daysLeft).toBe(3);
  });
  it('atrasado diz quanto falta por dia', () => {
    const p = goalPace({ ...cycle, value: 1 }, '2026-11-05');
    expect(p.state).toBe('behind');
    expect(p.perDayNeeded).toBeCloseTo(5 / 4);
  });
  it('no ritmo dentro de 5% do alvo', () => {
    expect(goalPace({ ...cycle, value: (6 * 4) / 7 + 0.2 }, '2026-11-05').state).toBe('on_track');
  });
  it('batida e sem prazo', () => {
    expect(goalPace({ ...cycle, value: 6 }, '2026-11-05').state).toBe('done');
    expect(
      goalPace({ start: '2026-01-01', end: null, value: 1, target: 12 }, '2026-11-05').state,
    ).toBe('no_deadline');
  });
});

describe('calendário do ano', () => {
  const rule: HabitRule = {
    scheduleKind: 'weekdays',
    weekdays: [1, 3, 5],
    timesPerWeek: null,
    targetValue: null,
    startOn: '2026-10-01',
  };
  const cal = habitYear(
    rule,
    [
      { localDate: '2026-10-26', value: null },
      { localDate: '2026-10-28', value: null },
      { localDate: '2026-11-02', value: null },
      { localDate: '2026-11-04', value: null },
    ],
    '2026-11-05',
    1,
  );

  it('53 semanas até hoje, começando na semana do perfil', () => {
    expect(cal.weeks).toHaveLength(53);
    expect(cal.weeks[52]?.start).toBe('2026-11-02');
    expect(cal.weeks[52]?.days[3]).toEqual({ date: '2026-11-05', state: 'off' });
    expect(cal.weeks[52]?.days[4]?.state).toBe('future');
  });

  it('classifica os dias e conta a consistência', () => {
    const states = new Map(cal.weeks.flatMap((w) => w.days.map((d) => [d.date, d.state])));
    expect(states.get('2026-09-30')).toBe('before');
    expect(states.get('2026-10-30')).toBe('missed');
    expect(states.get('2026-10-27')).toBe('off');
    expect(states.get('2026-11-02')).toBe('done');
    expect(cal.done).toBe(4);
    // Esperados de 01/10 a 04/11 em seg/qua/sex: 15 dias.
    expect(cal.expected).toBe(15);
    expect(cal.current).toBe(2);
    expect(cal.months.map((m) => m.label)).toContain('nov');
  });
});
