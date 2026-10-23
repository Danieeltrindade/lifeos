/**
 * Planejamento adaptativo por HEURÍSTICA EXPLICÁVEL (docs/planning.md, ADR-035).
 *
 * Algoritmo guloso e determinístico — não é otimização, não promete o plano "ideal":
 *  1. Tempo livre de cada dia = janelas de disponibilidade − compromissos e blocos já
 *     existentes (com o descanso configurado antes e depois) − o que já passou.
 *  2. Demandas: tarefas abertas com estimativa (menos o tempo já realizado e o já reservado
 *     em blocos futuros) e matérias com meta semanal (menos o estudado e o reservado).
 *  3. Ordem: prazo mais próximo → prioridade → data de criação; matérias depois das tarefas.
 *  4. Cada demanda ocupa os primeiros horários livres (período preferido primeiro) em blocos
 *     entre o mínimo e o máximo configurados, sem passar do limite diário e — para tarefas
 *     com prazo — só até o dia do prazo.
 *  5. O que não couber vira "sem horário", com o motivo e alternativas. Nada existente é
 *     sobrescrito: conflitos já presentes na agenda só são apontados.
 *
 * Toda proposta carrega os motivos (`reasons`) para a interface explicar a escolha.
 */
import { addDays, daysBetween, type ISODate } from '@/lib/date';
import { weekdayOf, zonedToUtc } from '@/lib/zoned';
import { median } from '@/modules/analytics/logic/metrics';

export type PreferredPeriod = 'any' | 'morning' | 'afternoon' | 'evening';

export interface PlanningPreferences {
  breakMinutes: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  preferredPeriod: PreferredPeriod;
  dailyLoadLimitMinutes: number;
}

export const DEFAULT_PREFERENCES: PlanningPreferences = {
  breakMinutes: 10,
  minBlockMinutes: 25,
  maxBlockMinutes: 90,
  preferredPeriod: 'any',
  dailyLoadLimitMinutes: 480,
};

export const PERIOD_RANGES: Record<Exclude<PreferredPeriod, 'any'>, [number, number]> = {
  morning: [5 * 60, 12 * 60],
  afternoon: [12 * 60, 18 * 60],
  evening: [18 * 60, 24 * 60],
};

export interface AvailabilityWindow {
  weekday: number;
  /** "HH:MM" ou "HH:MM:SS". */
  start: string;
  end: string;
}

export interface BusySlot {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface TaskDemand {
  kind: 'task';
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  dueOn: ISODate | null;
  createdAt: string;
  estimateMinutes: number;
  /** Tempo já realizado (atividades ligadas à tarefa). */
  actualMinutes: number;
  /** Já reservado em blocos FUTUROS ligados à tarefa. */
  plannedMinutes: number;
}

export interface StudyDemand {
  kind: 'study';
  id: string;
  title: string;
  /** Meta semanal da matéria (minutos). */
  weeklyTargetMinutes: number;
  /** Estudado nesta semana. */
  doneMinutes: number;
  /** Já reservado em blocos de estudo FUTUROS desta semana. */
  plannedMinutes: number;
  /** Último dia em que conta para a meta da semana (fim da semana atual). */
  untilDay?: ISODate;
}

export type Demand = TaskDemand | StudyDemand;

export interface PlanInput {
  timezone: string;
  /** Agora (instante) — nada é proposto no passado. */
  now: string;
  /** Dias a planejar [from, to). */
  from: ISODate;
  to: ISODate;
  windows: readonly AvailabilityWindow[];
  busy: readonly BusySlot[];
  preferences: PlanningPreferences;
  demands: readonly Demand[];
  /**
   * Razões realizado ÷ estimado de tarefas concluídas recentemente. Com 5 ou mais, a
   * mediana (limitada a 0,5–2) ajusta a estimativa das tarefas.
   */
  estimateHistory: readonly number[];
}

export interface Proposal {
  id: string;
  demandId: string;
  kind: 'task' | 'study';
  title: string;
  day: ISODate;
  start: string;
  end: string;
  minutes: number;
  reasons: string[];
}

export interface Unplaced {
  demandId: string;
  kind: 'task' | 'study';
  title: string;
  minutes: number;
  reason: string;
  alternatives: string[];
}

export interface Plan {
  proposals: Proposal[];
  unplaced: Unplaced[];
  /** Demandas que não precisam de tempo (já cobertas) ou não podem ser planejadas. */
  skipped: { demandId: string; title: string; reason: string }[];
  /** Fator aplicado às estimativas (1 = nenhum). */
  estimateFactor: number;
  estimateFactorSample: number;
  freeMinutesByDay: Record<ISODate, number>;
  notes: string[];
}

export const MIN_HISTORY_SAMPLE = 5;

interface Interval {
  start: number;
  end: number;
}

function toMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

function timeOf(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Instante de um minuto local do dia (minuto 1440 = 00:00 do dia seguinte). */
function instantOf(day: ISODate, minute: number, tz: string): number {
  if (minute >= 1440) return zonedToUtc(addDays(day, 1), timeOf(minute - 1440), tz).getTime();
  return zonedToUtc(day, timeOf(minute), tz).getTime();
}

/** Converte um instante no minuto local do dia `day` (pode ser < 0 ou > 1440). */
function minuteIn(day: ISODate, instantMs: number, tz: string): number {
  const dayStart = zonedToUtc(day, '00:00', tz).getTime();
  return Math.round((instantMs - dayStart) / 60_000);
}

function subtract(free: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const f of free) {
    if (cut.end <= f.start || cut.start >= f.end) {
      out.push(f);
      continue;
    }
    if (cut.start > f.start) out.push({ start: f.start, end: cut.start });
    if (cut.end < f.end) out.push({ start: cut.end, end: f.end });
  }
  return out;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_LABEL = { high: 'alta', medium: 'média', low: 'baixa' } as const;

function br(d: ISODate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

export function buildPlan(input: PlanInput): Plan {
  const { timezone: tz, preferences: prefs } = input;
  const nowMs = Date.parse(input.now);
  const days: ISODate[] = [];
  for (let d = input.from; d < input.to; d = addDays(d, 1)) days.push(d);

  // Fator de histórico (só com amostra suficiente).
  const ratios = input.estimateHistory.filter((r) => Number.isFinite(r) && r > 0);
  const med = ratios.length >= MIN_HISTORY_SAMPLE ? median(ratios) : null;
  const factor = med === null ? 1 : Math.min(2, Math.max(0.5, Math.round(med * 100) / 100));

  // 1. Tempo livre e carga já planejada por dia.
  const free = new Map<ISODate, Interval[]>();
  const load = new Map<ISODate, number>();
  for (const day of days) {
    let intervals: Interval[] = input.windows
      .filter((w) => w.weekday === weekdayOf(day))
      .map((w) => ({ start: toMinutes(w.start), end: Math.min(1440, toMinutes(w.end) || 1440) }))
      .filter((i) => i.end > i.start)
      .sort((a, b) => a.start - b.start);
    let busyMinutes = 0;
    for (const b of input.busy) {
      const s = minuteIn(day, Date.parse(b.start), tz);
      const e = minuteIn(day, Date.parse(b.end), tz);
      if (e <= 0 || s >= 1440) continue;
      busyMinutes += Math.min(e, 1440) - Math.max(s, 0);
      intervals = subtract(intervals, {
        start: s - prefs.breakMinutes,
        end: e + prefs.breakMinutes,
      });
    }
    const nowMinute = minuteIn(day, nowMs, tz);
    if (nowMinute > 0)
      intervals = subtract(intervals, { start: -1, end: Math.ceil(nowMinute / 5) * 5 });
    free.set(day, intervals);
    load.set(day, busyMinutes);
  }
  const freeMinutesByDay: Record<ISODate, number> = {};
  for (const [d, iv] of free) freeMinutesByDay[d] = iv.reduce((s, i) => s + i.end - i.start, 0);

  // 2. Demandas restantes.
  const skipped: Plan['skipped'] = [];
  type Need = { demand: Demand; minutes: number; reasons: string[]; lastDay: ISODate | null };
  const needs: Need[] = [];
  for (const d of input.demands) {
    if (d.kind === 'task') {
      if (!(d.estimateMinutes > 0)) {
        skipped.push({ demandId: d.id, title: d.title, reason: 'Sem estimativa de duração.' });
        continue;
      }
      const adjusted = Math.round(d.estimateMinutes * factor);
      const remaining = adjusted - d.actualMinutes - d.plannedMinutes;
      if (remaining < 5) {
        skipped.push({
          demandId: d.id,
          title: d.title,
          reason: 'O tempo estimado já está coberto pelo realizado e pelos blocos reservados.',
        });
        continue;
      }
      const reasons = [
        `Prioridade ${PRIORITY_LABEL[d.priority]}${d.dueOn ? `, prazo ${br(d.dueOn)}` : ', sem prazo'}.`,
        `Estimativa ${String(d.estimateMinutes)} min${
          factor !== 1 ? ` × ${String(factor)} (histórico) = ${String(adjusted)} min` : ''
        }; realizado ${String(d.actualMinutes)} min; já reservado ${String(d.plannedMinutes)} min.`,
      ];
      const lastDay = d.dueOn && d.dueOn >= input.from ? d.dueOn : null;
      if (d.dueOn && d.dueOn < input.from)
        reasons.push('Prazo já vencido: planejado o quanto antes.');
      needs.push({ demand: d, minutes: remaining, reasons, lastDay });
    } else {
      const remaining = d.weeklyTargetMinutes - d.doneMinutes - d.plannedMinutes;
      if (remaining < 5) {
        skipped.push({
          demandId: d.id,
          title: d.title,
          reason: 'A meta semanal já está coberta pelo estudado e pelos blocos reservados.',
        });
        continue;
      }
      needs.push({
        demand: d,
        minutes: remaining,
        reasons: [
          `Meta semanal ${String(d.weeklyTargetMinutes)} min; estudado ${String(d.doneMinutes)} min; reservado ${String(d.plannedMinutes)} min.`,
        ],
        lastDay: d.untilDay ?? null,
      });
    }
  }
  needs.sort((a, b) => {
    if (a.demand.kind !== b.demand.kind) return a.demand.kind === 'task' ? -1 : 1;
    if (a.demand.kind === 'task' && b.demand.kind === 'task') {
      const da = a.demand.dueOn ?? '9999-12-31';
      const db = b.demand.dueOn ?? '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      const pr = PRIORITY_RANK[a.demand.priority] - PRIORITY_RANK[b.demand.priority];
      if (pr !== 0) return pr;
      return a.demand.createdAt.localeCompare(b.demand.createdAt);
    }
    return b.minutes - a.minutes;
  });

  // 3-4. Alocação gulosa.
  const proposals: Proposal[] = [];
  const unplaced: Unplaced[] = [];
  const preferred = prefs.preferredPeriod === 'any' ? null : PERIOD_RANGES[prefs.preferredPeriod];
  for (const need of needs) {
    let left = need.minutes;
    for (const day of days) {
      if (left <= 0) break;
      if (need.lastDay && day > need.lastDay) break;
      // Repete enquanto houver demanda e algum intervalo utilizável neste dia.
      for (let guard = 0; left > 0 && guard < 50; guard++) {
        const intervals = free.get(day) ?? [];
        // Período preferido primeiro, depois o resto do dia, sempre em ordem de horário.
        const ordered = [...intervals].sort((a, b) => {
          const inA = preferred ? Number(a.start < preferred[1] && a.end > preferred[0]) : 0;
          const inB = preferred ? Number(b.start < preferred[1] && b.end > preferred[0]) : 0;
          return inB - inA || a.start - b.start;
        });
        let placed = false;
        for (const iv of ordered) {
          let start = iv.start;
          if (preferred && iv.start < preferred[1] && iv.end > preferred[0]) {
            start = Math.max(iv.start, preferred[0]);
          }
          start = Math.ceil(start / 5) * 5;
          const room = iv.end - start;
          const loadLeft = prefs.dailyLoadLimitMinutes - (load.get(day) ?? 0);
          let chunk = Math.min(left, prefs.maxBlockMinutes, room, loadLeft);
          // Blocos curtos demais só quando é o que falta da demanda.
          if (chunk < prefs.minBlockMinutes && chunk < left) continue;
          chunk = Math.floor(chunk / 5) * 5;
          if (chunk < 5) continue;
          const end = start + chunk;
          const inPreferred = preferred !== null && start >= preferred[0] && end <= preferred[1];
          const reasons = [
            ...need.reasons,
            `Primeiro horário livre${inPreferred ? ' no período preferido' : ''} em ${br(day)}, com ${String(prefs.breakMinutes)} min de descanso antes e depois de outros itens.`,
          ];
          if (need.lastDay && need.demand.kind === 'task') {
            reasons.push(
              `Dentro do prazo (${String(daysBetween(need.lastDay, day))} dia(s) de folga).`,
            );
          }
          proposals.push({
            id: `${need.demand.id}:${day}:${String(start)}`,
            demandId: need.demand.id,
            kind: need.demand.kind,
            title: need.demand.title,
            day,
            start: new Date(instantOf(day, start, tz)).toISOString(),
            end: new Date(instantOf(day, end, tz)).toISOString(),
            minutes: chunk,
            reasons,
          });
          left -= chunk;
          load.set(day, (load.get(day) ?? 0) + chunk);
          free.set(
            day,
            subtract(intervals, {
              start: start - prefs.breakMinutes,
              end: end + prefs.breakMinutes,
            }),
          );
          placed = true;
          break;
        }
        if (!placed) break;
      }
    }
    if (left > 0) {
      const alternatives = [
        'Adicionar janelas de disponibilidade nesses dias.',
        'Mover ou encurtar blocos flexíveis já existentes.',
      ];
      if (need.demand.kind === 'task' && need.demand.dueOn) {
        alternatives.push('Rever o prazo ou dividir a tarefa.');
      }
      alternatives.push('Aumentar o limite diário (com cuidado com o descanso).');
      unplaced.push({
        demandId: need.demand.id,
        kind: need.demand.kind,
        title: need.demand.title,
        minutes: Math.round(left),
        reason: need.lastDay
          ? need.demand.kind === 'task'
            ? `Não há horário livre suficiente até o prazo (${br(need.lastDay)}).`
            : `Não há horário livre suficiente até o fim da semana (${br(need.lastDay)}).`
          : 'Não há horário livre suficiente no período planejado.',
        alternatives,
      });
    }
  }

  const notes = [
    'Sugestão heurística baseada nas suas janelas de disponibilidade, compromissos, prazos, prioridades e estimativas — não é necessariamente o melhor plano possível.',
  ];
  if (factor !== 1) {
    notes.push(
      `As estimativas foram multiplicadas por ${String(factor)}: mediana de realizado ÷ estimado em ${String(ratios.length)} tarefas concluídas.`,
    );
  } else if (ratios.length > 0 && ratios.length < MIN_HISTORY_SAMPLE) {
    notes.push(
      `Histórico de estimativas ainda pequeno (${String(ratios.length)} de ${String(MIN_HISTORY_SAMPLE)} tarefas): estimativas usadas como estão.`,
    );
  }
  return {
    proposals,
    unplaced,
    skipped,
    estimateFactor: factor,
    estimateFactorSample: ratios.length,
    freeMinutesByDay,
    notes,
  };
}
