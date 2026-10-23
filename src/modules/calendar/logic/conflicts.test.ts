import { describe, expect, it } from 'vitest';
import { localDateIn } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import { conflictingIds, findConflicts, plannedMinutesByDay, type TimedSlot } from './conflicts';
import { expandEvent } from './recurrence';
import { occurrenceDate, planSplit, truncateRule } from './series-edit';

const slot = (id: string, start: string, end: string, kind: 'event' | 'block' = 'event') =>
  ({ id, title: id, start, end, kind }) satisfies TimedSlot;

describe('findConflicts', () => {
  it('detecta sobreposição e mede os minutos sobrepostos', () => {
    const c = findConflicts([
      slot('aula', '2026-10-22T13:00:00Z', '2026-10-22T15:00:00Z'),
      slot('estudo', '2026-10-22T14:30:00Z', '2026-10-22T16:00:00Z', 'block'),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ overlapMinutes: 30, severity: 'commitment_block' });
  });

  it('encostar não é conflito (intervalos semiabertos)', () => {
    expect(
      findConflicts([
        slot('a', '2026-10-22T10:00:00Z', '2026-10-22T11:00:00Z'),
        slot('b', '2026-10-22T11:00:00Z', '2026-10-22T12:00:00Z'),
      ]),
    ).toEqual([]);
  });

  it('um evento longo conflita com vários; ids marcados uma vez', () => {
    const c = findConflicts([
      slot('longo', '2026-10-22T08:00:00Z', '2026-10-22T18:00:00Z'),
      slot('x', '2026-10-22T09:00:00Z', '2026-10-22T10:00:00Z'),
      slot('y', '2026-10-22T17:00:00Z', '2026-10-22T19:00:00Z', 'block'),
    ]);
    expect(c.map((x) => [x.a.id, x.b.id])).toEqual([
      ['longo', 'x'],
      ['longo', 'y'],
    ]);
    expect(conflictingIds(c)).toEqual(new Set(['longo', 'x', 'y']));
    expect(c[0]?.severity).toBe('commitments');
  });

  it('ignora intervalos vazios ou invertidos', () => {
    expect(
      findConflicts([
        slot('a', '2026-10-22T10:00:00Z', '2026-10-22T10:00:00Z'),
        slot('b', '2026-10-22T09:00:00Z', '2026-10-22T11:00:00Z'),
      ]),
    ).toEqual([]);
  });

  it('ocorrência de série recorrente que cruza com evento avulso', () => {
    const occ = expandEvent(
      {
        id: 'serie',
        allDay: false,
        startsAt: '2026-10-19T22:00:00Z', // 19:00 em São Paulo
        endsAt: '2026-10-19T23:00:00Z',
        startDate: null,
        endDate: null,
        timezone: 'America/Sao_Paulo',
        recurrenceRule: 'FREQ=DAILY',
      },
      [],
      '2026-10-22T03:00:00Z',
      '2026-10-23T03:00:00Z',
    );
    const c = findConflicts([
      ...occ.map((o) => slot(`serie:${o.key}`, o.start, o.end, 'block')),
      slot('jantar', '2026-10-22T22:30:00Z', '2026-10-23T00:00:00Z'),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]?.overlapMinutes).toBe(30);
  });
});

describe('plannedMinutesByDay', () => {
  it('divide um bloco que cruza a meia-noite entre os dois dias (fuso do perfil)', () => {
    const tz = 'America/Sao_Paulo';
    const m = plannedMinutesByDay(
      [slot('plantao', '2026-10-23T01:00:00Z', '2026-10-23T05:00:00Z')], // 22:00 → 02:00
      (ms) => localDateIn(new Date(ms), tz),
      (day) => zonedToUtc(day, '00:00', tz).getTime(),
    );
    expect(Object.fromEntries(m)).toEqual({ '2026-10-22': 120, '2026-10-23': 120 });
  });
});

describe('editar "esta e as seguintes" (divisão da série)', () => {
  const weekly = {
    allDay: false,
    startsAt: '2026-10-05T22:00:00Z', // segunda 19:00 -03
    startDate: null,
    timezone: 'America/Sao_Paulo',
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
  };

  it('série sem fim: a original termina no dia anterior; a nova continua sem fim', () => {
    const plan = planSplit(weekly, '2026-10-19T22:00:00.000Z');
    expect(plan).toEqual({
      kind: 'split',
      splitDate: '2026-10-19',
      oldRule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261018T235959Z',
      newRule: 'FREQ=WEEKLY;BYDAY=MO',
      keptOccurrences: 2,
    });
  });

  it('série por contagem: mantém o total de ocorrências entre as duas', () => {
    const plan = planSplit(
      { ...weekly, recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=10' },
      '2026-10-19T22:00:00.000Z',
    );
    expect(plan).toMatchObject({
      oldRule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2',
      newRule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=8',
    });
  });

  it('a primeira ocorrência equivale a editar a série inteira', () => {
    expect(planSplit(weekly, '2026-10-05T22:00:00.000Z')).toEqual({ kind: 'whole' });
    expect(truncateRule(weekly, '2026-10-05T22:00:00.000Z')).toBeNull();
  });

  it('nenhuma ocorrência é duplicada ou perdida', () => {
    const plan = planSplit(weekly, '2026-10-19T22:00:00.000Z');
    if (plan.kind !== 'split') throw new Error('esperava divisão');
    const win = ['2026-10-01T00:00:00Z', '2026-11-30T00:00:00Z'] as const;
    const original = expandEvent(
      { id: 'a', ...weekly, endsAt: '2026-10-05T23:00:00Z', endDate: null },
      [],
      ...win,
    );
    const kept = expandEvent(
      {
        id: 'a',
        ...weekly,
        endsAt: '2026-10-05T23:00:00Z',
        endDate: null,
        recurrenceRule: plan.oldRule,
      },
      [],
      ...win,
    );
    const next = expandEvent(
      {
        id: 'b',
        ...weekly,
        startsAt: '2026-10-19T22:00:00Z',
        endsAt: '2026-10-19T23:00:00Z',
        endDate: null,
        recurrenceRule: plan.newRule,
      },
      [],
      ...win,
    );
    expect([...kept, ...next].map((o) => o.start)).toEqual(original.map((o) => o.start));
  });

  it('data local da ocorrência usa o fuso do evento, não UTC', () => {
    // 23:30 de domingo em São Paulo = 02:30 de segunda em UTC.
    expect(
      occurrenceDate({ ...weekly, timezone: 'America/Sao_Paulo' }, '2026-10-26T02:30:00.000Z'),
    ).toBe('2026-10-25');
  });

  it('dia inteiro usa a própria data como chave', () => {
    const daily = {
      allDay: true,
      startsAt: null,
      startDate: '2026-10-01',
      timezone: 'America/Sao_Paulo',
      recurrenceRule: 'FREQ=DAILY;UNTIL=20261031T235959Z',
    };
    expect(planSplit(daily, '2026-10-10')).toMatchObject({
      oldRule: 'FREQ=DAILY;UNTIL=20261009T235959Z',
      newRule: 'FREQ=DAILY;UNTIL=20261031T235959Z',
      keptOccurrences: 9,
    });
  });

  it('mudança de horário de verão: a nova série mantém o horário de parede', () => {
    const ny = {
      allDay: false,
      startsAt: '2026-10-26T23:00:00Z', // segunda 19:00 EDT
      startDate: null,
      timezone: 'America/New_York',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
    };
    const occ = expandEvent(
      { id: 'n', ...ny, endsAt: '2026-10-27T00:00:00Z', endDate: null },
      [],
      '2026-11-01T00:00:00Z',
      '2026-11-10T00:00:00Z',
    );
    // Depois de 1º/11 (EST, UTC−5) as 19:00 são 00:00 UTC.
    expect(occ[0]?.start).toBe('2026-11-03T00:00:00.000Z');
    const plan = planSplit(ny, occ[0]?.key ?? '');
    expect(plan).toMatchObject({ splitDate: '2026-11-02' });
  });
});
