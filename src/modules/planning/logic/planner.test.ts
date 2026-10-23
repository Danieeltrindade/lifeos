import { describe, expect, it } from 'vitest';
import { findConflicts } from '@/modules/calendar/logic/conflicts';
import { buildPlan, DEFAULT_PREFERENCES, type PlanInput, type TaskDemand } from './planner';

const TZ = 'America/Sao_Paulo';
// 26/10/2026 é segunda-feira. "Agora" = domingo 25/10 12:00 (-03).
const base: PlanInput = {
  timezone: TZ,
  now: '2026-10-25T15:00:00Z',
  from: '2026-10-26',
  to: '2026-10-29',
  windows: [1, 2, 3].map((weekday) => ({ weekday, start: '08:00', end: '12:00' })),
  busy: [],
  preferences: DEFAULT_PREFERENCES,
  demands: [],
  estimateHistory: [],
};

const task = (o: Partial<TaskDemand>): TaskDemand => ({
  kind: 'task',
  id: 't',
  title: 'Relatório',
  priority: 'medium',
  dueOn: null,
  createdAt: '2026-10-01T00:00:00Z',
  estimateMinutes: 120,
  actualMinutes: 0,
  plannedMinutes: 0,
  ...o,
});

const local = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16);

describe('buildPlan', () => {
  it('divide a demanda em blocos de até 90 min com descanso entre eles', () => {
    const plan = buildPlan({ ...base, demands: [task({})] });
    expect(plan.proposals.map((p) => [local(p.start), local(p.end), p.minutes])).toEqual([
      ['2026-10-26 08:00', '2026-10-26 09:30', 90],
      ['2026-10-26 09:40', '2026-10-26 10:10', 30],
    ]);
    expect(plan.unplaced).toEqual([]);
    expect(plan.proposals[0]?.reasons.join(' ')).toContain('Prioridade média, sem prazo');
  });

  it('desconta o realizado e o já reservado; tarefa coberta é pulada com motivo', () => {
    const plan = buildPlan({
      ...base,
      demands: [task({ actualMinutes: 60, plannedMinutes: 60 })],
    });
    expect(plan.proposals).toEqual([]);
    expect(plan.skipped[0]?.reason).toContain('já está coberto');
  });

  it('não sobrepõe compromissos existentes e respeita o descanso', () => {
    const busy = [
      { id: 'aula', title: 'Aula', start: '2026-10-26T12:00:00Z', end: '2026-10-26T13:00:00Z' },
    ]; // 09:00–10:00
    const plan = buildPlan({ ...base, busy, demands: [task({ estimateMinutes: 60 })] });
    // 08:00–08:50 é curto demais para 60 min? Não: 50 ≥ mínimo (25), então usa 50 min e o resto depois.
    expect(plan.proposals.map((p) => [local(p.start), local(p.end)])).toEqual([
      ['2026-10-26 08:00', '2026-10-26 08:50'],
      ['2026-10-26 10:10', '2026-10-26 10:20'],
    ]);
    const conflicts = findConflicts([
      ...busy.map((b) => ({ ...b, kind: 'event' as const })),
      ...plan.proposals.map((p) => ({
        id: p.id,
        title: p.title,
        start: p.start,
        end: p.end,
        kind: 'block' as const,
      })),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('prazo: só até o dia do prazo; o excedente fica sem horário com alternativas', () => {
    const plan = buildPlan({
      ...base,
      demands: [task({ estimateMinutes: 300, dueOn: '2026-10-26' })],
    });
    expect(plan.proposals.every((p) => p.day === '2026-10-26')).toBe(true);
    const placed = plan.proposals.reduce((s, p) => s + p.minutes, 0);
    expect(plan.unplaced).toHaveLength(1);
    expect(plan.unplaced[0]?.minutes).toBe(300 - placed);
    expect(plan.unplaced[0]?.reason).toContain('até o prazo (26/10)');
    expect(plan.unplaced[0]?.alternatives).toContain('Rever o prazo ou dividir a tarefa.');
  });

  it('ordem: prazo mais próximo, depois prioridade', () => {
    const plan = buildPlan({
      ...base,
      demands: [
        task({ id: 'b', title: 'B', priority: 'high', estimateMinutes: 30 }),
        task({ id: 'a', title: 'A', priority: 'low', estimateMinutes: 30, dueOn: '2026-10-27' }),
        task({ id: 'c', title: 'C', priority: 'high', estimateMinutes: 30, dueOn: '2026-10-27' }),
      ],
    });
    expect(plan.proposals.map((p) => p.demandId)).toEqual(['c', 'a', 'b']);
  });

  it('limite diário: não passa da carga configurada', () => {
    const plan = buildPlan({
      ...base,
      preferences: { ...DEFAULT_PREFERENCES, dailyLoadLimitMinutes: 60 },
      demands: [task({ estimateMinutes: 150 })],
    });
    const byDay = new Map<string, number>();
    for (const p of plan.proposals) byDay.set(p.day, (byDay.get(p.day) ?? 0) + p.minutes);
    expect([...byDay.values()].every((m) => m <= 60)).toBe(true);
    expect([...byDay.keys()]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  });

  it('período preferido é tentado primeiro', () => {
    const plan = buildPlan({
      ...base,
      windows: [{ weekday: 1, start: '08:00', end: '20:00' }],
      preferences: { ...DEFAULT_PREFERENCES, preferredPeriod: 'evening' },
      demands: [task({ estimateMinutes: 60 })],
    });
    expect(local(plan.proposals[0]?.start ?? '')).toBe('2026-10-26 18:00');
    expect(plan.proposals[0]?.reasons.join(' ')).toContain('período preferido');
  });

  it('nada no passado', () => {
    const plan = buildPlan({
      ...base,
      now: '2026-10-26T13:00:00Z', // segunda 10:00
      demands: [task({ estimateMinutes: 60 })],
    });
    expect(local(plan.proposals[0]?.start ?? '')).toBe('2026-10-26 10:00');
  });

  it('histórico só ajusta com 5+ amostras e informa isso', () => {
    const small = buildPlan({
      ...base,
      demands: [task({ estimateMinutes: 60 })],
      estimateHistory: [2, 2],
    });
    expect(small.estimateFactor).toBe(1);
    expect(small.notes.join(' ')).toContain('ainda pequeno');
    const big = buildPlan({
      ...base,
      demands: [task({ estimateMinutes: 60 })],
      estimateHistory: [1.5, 1.5, 1.5, 1.5, 3],
    });
    expect(big.estimateFactor).toBe(1.5);
    expect(big.proposals.reduce((s, p) => s + p.minutes, 0)).toBe(90);
  });

  it('matéria com meta semanal entra depois das tarefas; sem estimativa é pulada', () => {
    const plan = buildPlan({
      ...base,
      demands: [
        {
          kind: 'study',
          id: 's',
          title: 'Física',
          weeklyTargetMinutes: 120,
          doneMinutes: 60,
          plannedMinutes: 30,
        },
        task({ id: 'x', estimateMinutes: 0 }),
        task({ id: 'y', estimateMinutes: 30 }),
      ],
    });
    expect(plan.proposals.map((p) => [p.demandId, p.minutes])).toEqual([
      ['y', 30],
      ['s', 30],
    ]);
    expect(plan.skipped.map((s) => s.demandId)).toEqual(['x']);
  });

  it('sem janelas de disponibilidade: nada é proposto', () => {
    const plan = buildPlan({ ...base, windows: [], demands: [task({})] });
    expect(plan.proposals).toEqual([]);
    expect(plan.unplaced).toHaveLength(1);
  });
});
