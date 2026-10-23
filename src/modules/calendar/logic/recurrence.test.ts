import { describe, expect, it } from 'vitest';
import {
  describeRule,
  expandEvent,
  formatRule,
  occurrenceDates,
  parseRule,
  type EventSeries,
} from './recurrence';

function rule(text: string) {
  const r = parseRule(text);
  if (!r) throw new Error(`regra inválida: ${text}`);
  return r;
}

const timed = (overrides: Partial<EventSeries> = {}): EventSeries => ({
  id: 'e1',
  allDay: false,
  startsAt: '2026-10-05T22:00:00.000Z', // segunda, 19:00 em São Paulo
  endsAt: '2026-10-05T23:30:00.000Z',
  startDate: null,
  endDate: null,
  timezone: 'America/Sao_Paulo',
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,WE',
  ...overrides,
});

describe('parseRule / formatRule', () => {
  it('lê e reescreve o subconjunto suportado', () => {
    const r = rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO;COUNT=6');
    expect(r).toMatchObject({ freq: 'WEEKLY', interval: 2, byWeekday: [1, 3], count: 6 });
    expect(formatRule(r)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6');
  });

  it('recusa partes não suportadas em vez de interpretar errado', () => {
    expect(parseRule('FREQ=WEEKLY;BYSETPOS=1')).toBeNull();
    expect(parseRule('FREQ=HOURLY')).toBeNull();
    expect(parseRule('FREQ=DAILY;INTERVAL=0')).toBeNull();
  });

  it('descreve em português', () => {
    expect(describeRule(rule('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10'))).toBe(
      'Toda semana: segunda, quarta e sexta, 10 vezes',
    );
    expect(describeRule(rule('FREQ=MONTHLY;BYDAY=-1FR'))).toBe('Todo mês (última sexta)');
  });
});

describe('occurrenceDates', () => {
  it('diária com intervalo e COUNT', () => {
    expect(
      occurrenceDates(rule('FREQ=DAILY;INTERVAL=2;COUNT=3'), '2026-10-01', '2027-01-01'),
    ).toEqual(['2026-10-01', '2026-10-03', '2026-10-05']);
  });

  it('UNTIL é inclusivo no calendário local', () => {
    expect(
      occurrenceDates(rule('FREQ=DAILY;UNTIL=20261003T235959Z'), '2026-10-01', '2027-01-01'),
    ).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('mensal no dia 31 pula meses sem dia 31', () => {
    expect(occurrenceDates(rule('FREQ=MONTHLY;COUNT=3'), '2026-01-31', '2027-01-01')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
  });

  it('mensal por posição: segunda terça-feira e última sexta', () => {
    expect(
      occurrenceDates(rule('FREQ=MONTHLY;BYDAY=2TU;COUNT=2'), '2026-10-01', '2027-01-01'),
    ).toEqual(['2026-10-13', '2026-11-10']);
    expect(
      occurrenceDates(rule('FREQ=MONTHLY;BYDAY=-1FR;COUNT=2'), '2026-10-01', '2027-01-01'),
    ).toEqual(['2026-10-30', '2026-11-27']);
  });

  it('anual em 29/02 só nos anos bissextos', () => {
    expect(occurrenceDates(rule('FREQ=YEARLY;COUNT=2'), '2024-02-29', '2033-01-01')).toEqual([
      '2024-02-29',
      '2028-02-29',
    ]);
  });

  it('sem fim não gera ocorrências além da janela (nada de cópias infinitas)', () => {
    const dates = occurrenceDates(rule('FREQ=DAILY'), '2026-10-01', '2026-10-08');
    expect(dates).toHaveLength(7);
  });
});

describe('expandEvent', () => {
  it('semanal: só as ocorrências da janela, no horário local', () => {
    const list = expandEvent(timed(), [], '2026-10-12T03:00:00Z', '2026-10-19T03:00:00Z');
    expect(list.map((o) => o.start)).toEqual([
      '2026-10-12T22:00:00.000Z',
      '2026-10-14T22:00:00.000Z',
    ]);
    expect(list.every((o) => o.isRecurring)).toBe(true);
  });

  it('mantém 19:00 local através da mudança de horário (Nova York)', () => {
    const ny = timed({
      startsAt: '2026-10-26T23:00:00.000Z', // segunda 19:00 EDT
      endsAt: '2026-10-27T00:00:00.000Z',
      timezone: 'America/New_York',
      recurrenceRule: 'FREQ=WEEKLY',
    });
    const list = expandEvent(ny, [], '2026-10-26T00:00:00Z', '2026-11-10T00:00:00Z');
    // A janela termina em 10/11 00:00Z, exatamente o início da 3ª ocorrência (excluída).
    expect(list.map((o) => o.start)).toEqual([
      '2026-10-26T23:00:00.000Z',
      '2026-11-03T00:00:00.000Z', // 19:00 EST
    ]);
  });

  it('exceções: cancelada some; alterada usa o novo horário e título', () => {
    const list = expandEvent(
      timed(),
      [
        {
          eventId: 'e1',
          originalStartsAt: '2026-10-12T22:00:00.000Z',
          originalDate: null,
          kind: 'cancelled',
          newTitle: null,
          newStartsAt: null,
          newEndsAt: null,
        },
        {
          eventId: 'e1',
          originalStartsAt: '2026-10-14T22:00:00.000Z',
          originalDate: null,
          kind: 'modified',
          newTitle: 'Remarcado',
          newStartsAt: '2026-10-15T12:00:00.000Z',
          newEndsAt: '2026-10-15T13:00:00.000Z',
        },
      ],
      '2026-10-12T03:00:00Z',
      '2026-10-19T03:00:00Z',
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      key: '2026-10-14T22:00:00.000Z',
      start: '2026-10-15T12:00:00.000Z',
      title: 'Remarcado',
      modified: true,
    });
  });

  it('evento que cruza a meia-noite aparece na janela do dia seguinte', () => {
    const late = timed({
      startsAt: '2026-10-21T02:00:00.000Z', // 20/10 23:00 local
      endsAt: '2026-10-21T04:00:00.000Z', // 21/10 01:00 local
      recurrenceRule: null,
    });
    expect(expandEvent(late, [], '2026-10-21T03:00:00Z', '2026-10-22T03:00:00Z')).toHaveLength(1);
  });

  it('dia inteiro: datas sem fuso, fim exclusivo', () => {
    const allDay: EventSeries = {
      id: 'a',
      allDay: true,
      startsAt: null,
      endsAt: null,
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      timezone: 'UTC',
      recurrenceRule: null,
    };
    expect(expandEvent(allDay, [], '2026-10-21T00:00:00Z', '2026-10-22T00:00:00Z')).toEqual([
      expect.objectContaining({ start: '2026-10-20', end: '2026-10-22', allDay: true }),
    ]);
  });

  it('regra não suportada mostra só a primeira ocorrência, sinalizada', () => {
    const list = expandEvent(
      timed({ recurrenceRule: 'FREQ=WEEKLY;BYSETPOS=1' }),
      [],
      '2026-10-01T00:00:00Z',
      '2026-12-01T00:00:00Z',
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.unsupportedRule).toBe(true);
  });
});
