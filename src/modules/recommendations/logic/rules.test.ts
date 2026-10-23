import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/date';
import { evaluateRules, RULES, ruleById, type RuleContext, type RuleId } from './rules';

const TODAY = '2026-10-22'; // quinta-feira

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    now: new Date('2026-10-22T15:00:00Z'),
    today: TODAY,
    weekStartsOn: 1,
    endOfDay: (d) => `${addDays(d, 1)}T03:00:00.000Z`,
    tasks: [],
    reviewCards: [],
    topicNames: new Map(),
    agenda: [],
    plannedMinutesByDay: new Map(),
    dailyLoadLimitMinutes: 480,
    goals: [],
    habits: [],
    estimates: [],
    overdueMilestones: [],
    reviewedWeeks: new Set(),
    hasAnyRecord: true,
    ...overrides,
  };
}

const only = (id: RuleId, c: RuleContext) =>
  evaluateRules(c, new Set([id])).candidates.filter((x) => x.ruleId === id);

describe('catálogo de regras', () => {
  it('toda regra é documentada (descrição, gatilho, dados, prioridade, encerramento)', () => {
    expect(RULES).toHaveLength(11);
    const ids = new Set<string>();
    for (const r of RULES) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.description.length).toBeGreaterThan(10);
      expect(r.trigger.length).toBeGreaterThan(10);
      expect(r.dataNeeded.length).toBeGreaterThan(0);
      expect(r.closing.length).toBeGreaterThan(10);
    }
    expect(ruleById('task.overdue')?.title).toBe('Tarefas atrasadas');
  });

  it('conta vazia: nenhuma recomendação inventada', () => {
    const e = evaluateRules(ctx({ estimates: [] }));
    expect(e.candidates).toEqual([]);
    expect(e.insufficient).toContain('estimate.drift');
  });
});

describe('revisões', () => {
  const cards = [
    { id: 'c1', topic_id: 't1', due_on: '2026-10-10', status: 'active' },
    { id: 'c2', topic_id: 't2', due_on: '2026-10-21', status: 'active' },
    { id: 'c3', topic_id: 't2', due_on: '2026-10-22', status: 'active' },
    { id: 'c4', topic_id: 't2', due_on: '2026-10-23', status: 'active' },
    { id: 'c5', topic_id: 't2', due_on: '2026-10-01', status: 'archived' },
  ];

  it('atrasadas: agrega numa única recomendação com a mais antiga', () => {
    const [r] = only(
      'review.overdue',
      ctx({ reviewCards: cards, topicNames: new Map([['t1', 'Limites']]) }),
    );
    expect(r).toMatchObject({ dedupKey: 'all', title: '2 revisões atrasadas', priority: 1 });
    expect(r?.evidence).toMatchObject({ atrasadas: 2, maisAntiga: '2026-10-10' });
  });

  it('atraso pequeno: prioridade média', () => {
    const [r] = only('review.overdue', ctx({ reviewCards: cards.slice(1, 2) }));
    expect(r?.priority).toBe(2);
  });

  it('próximas: hoje e amanhã, expira no fim de amanhã', () => {
    const [r] = only('review.due_soon', ctx({ reviewCards: cards }));
    expect(r).toMatchObject({
      dedupKey: 'day:2026-10-22',
      evidence: { hoje: 1, amanha: 1 },
      expiresAt: '2026-10-24T03:00:00.000Z',
    });
  });
});

describe('tarefas', () => {
  const t = (id: string, due: string | null, priority = 'medium', status = 'todo') => ({
    id,
    title: id,
    status,
    priority,
    due_on: due,
  });

  it('prioridade alta com prazo em até 2 dias: uma por tarefa', () => {
    const r = only(
      'task.high_priority_due_soon',
      ctx({
        tasks: [
          t('a', '2026-10-22', 'high'),
          t('b', '2026-10-24', 'high'),
          t('c', '2026-10-25', 'high'),
          t('d', '2026-10-22', 'medium'),
          t('e', '2026-10-22', 'high', 'done'),
        ],
      }),
    );
    expect(r.map((x) => x.dedupKey)).toEqual(['task:a:2026-10-22', 'task:b:2026-10-24']);
    expect(r[0]?.title).toBe('“a” vence hoje');
  });

  it('atrasadas: ignora concluídas e canceladas', () => {
    const [r] = only(
      'task.overdue',
      ctx({
        tasks: [
          t('a', '2026-10-01'),
          t('b', '2026-10-21', 'high', 'in_progress'),
          t('c', '2026-10-01', 'high', 'done'),
          t('d', '2026-10-01', 'high', 'cancelled'),
          t('e', '2026-10-22'),
        ],
      }),
    );
    expect(r).toMatchObject({ evidence: { atrasadas: 2, prioridadeAlta: 1 }, priority: 1 });
  });
});

describe('agenda', () => {
  const s = (id: string, start: string, end: string, kind: 'event' | 'block' = 'event') => ({
    id,
    title: id,
    start,
    end,
    kind,
    day: start.slice(0, 10),
  });

  it('conflito futuro gera recomendação estável por par; passado não', () => {
    const agenda = [
      s('aula', '2026-10-23T13:00:00Z', '2026-10-23T15:00:00Z'),
      s('bloco', '2026-10-23T14:00:00Z', '2026-10-23T16:00:00Z', 'block'),
      s('velho1', '2026-10-22T10:00:00Z', '2026-10-22T11:00:00Z'),
      s('velho2', '2026-10-22T10:30:00Z', '2026-10-22T11:30:00Z'),
    ];
    const r = only('calendar.conflict', ctx({ agenda }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      dedupKey: 'aula|bloco',
      priority: 2,
      expiresAt: '2026-10-23T15:00:00.000Z',
    });
  });

  it('sobrecarga: só dias acima do limite', () => {
    const r = only(
      'day.overload',
      ctx({
        plannedMinutesByDay: new Map([
          ['2026-10-22', 300],
          ['2026-10-24', 600],
        ]),
      }),
    );
    expect(r.map((x) => x.dedupKey)).toEqual(['day:2026-10-24']);
    expect(r[0]?.title).toBe('24/10 tem 10 h planejadas');
  });
});

describe('metas', () => {
  const g = (o: Partial<RuleContext['goals'][number]>) => ({
    id: 'g',
    title: 'Meta',
    period: 'weekly',
    status: 'active',
    archived: false,
    startOn: '2026-09-01',
    dueOn: null,
    unit: 'h',
    cycleStart: '2026-10-19',
    cycleEnd: '2026-10-26',
    value: 0,
    target: 5,
    ...o,
  });

  it('semanal: metade do ciclo sem progresso dispara; com progresso não', () => {
    expect(only('goal.stalled', ctx({ goals: [g({})] }))).toHaveLength(1);
    expect(only('goal.stalled', ctx({ goals: [g({ value: 1 })] }))).toHaveLength(0);
    expect(
      only(
        'goal.stalled',
        ctx({ goals: [g({ cycleStart: '2026-10-21', cycleEnd: '2026-10-28' })] }),
      ),
    ).toHaveLength(0);
  });

  it('diária, pausada, arquivada ou já cumprida: não dispara', () => {
    expect(
      only(
        'goal.stalled',
        ctx({
          goals: [
            g({ id: '1', period: 'daily' }),
            g({ id: '2', status: 'paused' }),
            g({ id: '3', archived: true }),
            g({ id: '4', value: 5 }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('até o prazo: atrás do ritmo linear', () => {
    const behind = g({
      period: 'once',
      startOn: '2026-10-01',
      dueOn: '2026-10-31',
      cycleStart: '2026-10-01',
      cycleEnd: '2026-11-01',
      value: 1,
      target: 10,
    });
    const [r] = only('goal.stalled', ctx({ goals: [behind] }));
    expect(r?.title).toBe('“Meta” está atrás do ritmo');
    expect(only('goal.stalled', ctx({ goals: [{ ...behind, value: 5 }] }))).toEqual([]);
  });
});

describe('estimativas (amostra mínima)', () => {
  const pairs = (n: number, ratio: number) =>
    Array.from({ length: n }, (_, i) => ({
      taskId: String(i),
      estimateMinutes: 60,
      actualSeconds: 60 * 60 * ratio,
    }));

  it('menos de 5 tarefas comparáveis: regra não avaliada (não fecha nem cria)', () => {
    const e = evaluateRules(ctx({ estimates: pairs(4, 3) }), new Set(['estimate.drift']));
    expect(e.insufficient).toEqual(['estimate.drift']);
    expect(e.evaluated).toEqual([]);
  });

  it('dados não carregados: também não avaliada', () => {
    expect(
      evaluateRules(ctx({ estimates: null }), new Set(['estimate.drift'])).insufficient,
    ).toEqual(['estimate.drift']);
  });

  it('mediana acima de 1,5×: recomenda; dentro da faixa: nada', () => {
    expect(only('estimate.drift', ctx({ estimates: pairs(5, 2) }))[0]).toMatchObject({
      dedupKey: 'over',
      title: 'Suas tarefas levam cerca de 2× o tempo estimado',
    });
    expect(only('estimate.drift', ctx({ estimates: pairs(5, 1.2) }))).toEqual([]);
    expect(only('estimate.drift', ctx({ estimates: pairs(5, 0.5) }))[0]?.dedupKey).toBe('under');
  });
});

describe('hábitos', () => {
  const rule = {
    scheduleKind: 'daily' as const,
    weekdays: null,
    timesPerWeek: null,
    targetValue: null,
    startOn: '2026-09-01',
  };
  const checkins = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ localDate: addDays('2026-10-21', -i), value: null }));

  it('abaixo de 60% com amostra suficiente dispara', () => {
    const [r] = only(
      'habit.below_target',
      ctx({
        habits: [
          { id: 'h', name: 'Ler', status: 'active', archived: false, rule, checkins: checkins(10) },
        ],
      }),
    );
    // 27 dias elegíveis (hoje não cumprido fica de fora), 10 cumpridos.
    expect(r?.evidence).toMatchObject({ cumpridos: 10, esperados: 27 });
  });

  it('hábito recente (menos de 8 dias elegíveis) não dispara', () => {
    expect(
      only(
        'habit.below_target',
        ctx({
          habits: [
            {
              id: 'h',
              name: 'Ler',
              status: 'active',
              archived: false,
              rule: { ...rule, startOn: '2026-10-17' },
              checkins: [],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe('projetos e revisão semanal', () => {
  it('marco atrasado: uma por marco', () => {
    const r = only(
      'project.milestone_overdue',
      ctx({
        overdueMilestones: [
          { id: 'm', title: 'Entrega', projectId: 'p', projectName: 'TCC', dueOn: '2026-10-20' },
        ],
      }),
    );
    expect(r[0]).toMatchObject({
      dedupKey: 'milestone:m:2026-10-20',
      action: { to: '/projetos/p' },
    });
  });

  it('revisão semanal: domingo (fim da semana) e segunda/terça seguintes', () => {
    const sunday = ctx({ today: '2026-10-25' });
    expect(only('week.review_due', sunday)[0]?.dedupKey).toBe('week:2026-10-19');
    const tuesday = ctx({ today: '2026-10-27' });
    expect(only('week.review_due', tuesday)[0]?.dedupKey).toBe('week:2026-10-19');
    expect(only('week.review_due', ctx())).toEqual([]); // quinta
    expect(
      only('week.review_due', ctx({ today: '2026-10-25', reviewedWeeks: new Set(['2026-10-19']) })),
    ).toEqual([]);
    expect(only('week.review_due', ctx({ today: '2026-10-25', hasAnyRecord: false }))).toEqual([]);
  });
});

describe('avaliação', () => {
  it('ordena por prioridade e não duplica escopo dentro da mesma avaliação', () => {
    const e = evaluateRules(
      ctx({
        reviewCards: [{ id: 'c', topic_id: 't', due_on: '2026-10-22', status: 'active' }],
        tasks: [{ id: 'a', title: 'a', status: 'todo', priority: 'high', due_on: '2026-10-22' }],
      }),
    );
    expect(e.candidates.map((c) => c.ruleId)).toEqual([
      'task.high_priority_due_soon',
      'review.due_soon',
    ]);
    expect(e.evaluated).toContain('task.overdue');
  });
});
