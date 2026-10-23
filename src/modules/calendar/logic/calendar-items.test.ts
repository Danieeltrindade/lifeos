import { describe, expect, it } from 'vitest';
import {
  actualSecondsInBlock,
  buildCalendarItems,
  fromWall,
  toWall,
  type CalendarEvent,
} from './calendar-items';

const TZ = 'America/Sao_Paulo';

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    user_id: 'u',
    title: 'Aula',
    description: '',
    kind: 'event',
    all_day: false,
    starts_at: '2026-10-21T22:00:00.000Z',
    ends_at: '2026-10-22T00:00:00.000Z',
    start_date: null,
    end_date: null,
    timezone: TZ,
    recurrence_rule: null,
    task_id: null,
    subject_id: null,
    habit_id: null,
    category_id: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const base = {
  exceptions: [],
  tasks: [],
  reviews: [],
  topicNames: new Map<string, string>(),
  activities: [],
  timeZone: TZ,
  windowStart: '2026-10-19T03:00:00.000Z',
  windowEnd: '2026-10-26T03:00:00.000Z',
  fromDate: '2026-10-19',
  toDate: '2026-10-26',
};

describe('horário de parede (fuso do perfil)', () => {
  it('ida e volta preservam o instante', () => {
    const wall = toWall('2026-10-21T22:00:00.000Z', TZ);
    expect(wall).toBe('2026-10-21T19:00:00');
    expect(fromWall(new Date(`${wall}Z`), TZ)).toBe('2026-10-21T22:00:00.000Z');
  });
});

describe('itens do calendário', () => {
  it('distingue compromissos, blocos, prazos, revisões e realizado', () => {
    const items = buildCalendarItems({
      ...base,
      events: [event(), event({ id: 'b1', kind: 'study', title: 'Estudar cálculo' })],
      tasks: [
        { id: 't1', title: 'Entregar lista', due_on: '2026-10-22', status: 'todo' },
        { id: 't2', title: 'Cancelada', due_on: '2026-10-22', status: 'cancelled' },
        { id: 't3', title: 'Fora', due_on: '2026-11-22', status: 'todo' },
      ],
      reviews: [{ id: 'r1', topic_id: 'top', due_on: '2026-10-20', status: 'active' }],
      topicNames: new Map([['top', 'Integrais']]),
      activities: [
        {
          id: 'a1',
          title: 'Sessão',
          started_at: '2026-10-20T12:00:00Z',
          ended_at: '2026-10-20T13:00:00Z',
          session_id: 's1',
        },
        {
          id: 'a2',
          title: 'Manual',
          started_at: '2026-10-20T12:00:00Z',
          ended_at: '2026-10-20T13:00:00Z',
          session_id: null,
        },
      ],
    });
    expect(items.map((i) => [i.source, i.title])).toEqual([
      ['event', 'Aula'],
      ['block', 'Estudar cálculo'],
      ['task_due', 'Prazo: Entregar lista'],
      ['review', 'Revisão: Integrais'],
      ['done', 'Realizado: Sessão'],
    ]);
    expect(items.filter((i) => i.editable).map((i) => i.source)).toEqual(['event', 'block']);
  });

  it('evento recorrente gera só as ocorrências da janela', () => {
    const items = buildCalendarItems({
      ...base,
      events: [
        event({
          recurrence_rule: 'FREQ=DAILY',
          starts_at: '2026-01-01T22:00:00.000Z',
          ends_at: '2026-01-01T23:00:00.000Z',
        }),
      ],
    });
    expect(items).toHaveLength(7);
    expect(items[0]?.start).toBe('2026-10-19T19:00:00');
  });

  it('evento que cruza a meia-noite mantém início e fim locais', () => {
    const [item] = buildCalendarItems({
      ...base,
      events: [
        event({ starts_at: '2026-10-22T01:30:00.000Z', ends_at: '2026-10-22T04:00:00.000Z' }),
      ],
    });
    expect(item?.start).toBe('2026-10-21T22:30:00');
    expect(item?.end).toBe('2026-10-22T01:00:00');
  });
});

describe('planejado × realizado', () => {
  it('soma só atividades da mesma matéria, proporcional à sobreposição', () => {
    const seconds = actualSecondsInBlock(
      { start: '2026-10-20T12:00:00Z', end: '2026-10-20T14:00:00Z', subjectId: 's', taskId: null },
      [
        // 1 h dentro do bloco (de 2 h de atividade com 100 min líquidos → 50 min)
        {
          started_at: '2026-10-20T13:00:00Z',
          ended_at: '2026-10-20T15:00:00Z',
          duration_seconds: 6000,
          subject_id: 's',
          task_id: null,
        },
        {
          started_at: '2026-10-20T12:00:00Z',
          ended_at: '2026-10-20T13:00:00Z',
          duration_seconds: 3600,
          subject_id: 'outra',
          task_id: null,
        },
      ],
    );
    expect(seconds).toBe(3000);
  });

  it('bloco sem vínculo não tem realizado (e nada conclui tarefas)', () => {
    expect(actualSecondsInBlock({ start: 'a', end: 'b', subjectId: null, taskId: null }, [])).toBe(
      0,
    );
  });
});
