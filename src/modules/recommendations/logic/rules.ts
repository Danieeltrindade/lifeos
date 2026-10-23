/**
 * Motor de recomendações por REGRAS EXPLÍCITAS (docs/recommendations.md, ADR-034).
 *
 * Software convencional e determinístico: cada regra é uma função pura que recebe um retrato
 * dos dados (RuleContext) e devolve candidatas — ou `null` quando não há dados suficientes
 * para avaliá-la (aí a regra NÃO é declarada como avaliada e nada dela é encerrado). Não há
 * modelo estatístico, aprendizado, IA ou serviço externo.
 *
 * O banco (public.sync_recommendations) persiste as candidatas com deduplicação por
 * (regra, escopo), período de espera depois de rejeitar e encerramento automático quando a
 * condição deixa de valer. Aceitar uma recomendação NUNCA altera agenda, tarefas ou metas:
 * a ação sugerida é um atalho para a tela onde o usuário decide.
 */
import { addDays, daysBetween, type ISODate } from '@/lib/date';
import { findConflicts, type TimedSlot } from '@/modules/calendar/logic/conflicts';
import type { Checkin, HabitRule } from '@/modules/habits/logic/habits';
import { consistencyInRange } from '@/modules/analytics/logic/habit-stats';
import { estimateAccuracy, type EstimatePair } from '@/modules/analytics/logic/metrics';

export type RulePriority = 1 | 2 | 3;

export interface RecommendationAction {
  kind: 'navigate';
  to: string;
  label: string;
}

export interface Candidate {
  ruleId: RuleId;
  /** Escopo da deduplicação: no máximo UMA recomendação aberta por (regra, escopo). */
  dedupKey: string;
  title: string;
  rationale: string;
  /** Dados que dispararam a regra (mostrados ao usuário em "Base"). */
  evidence: Record<string, string | number | boolean | null | string[]>;
  priority: RulePriority;
  action: RecommendationAction;
  /** Depois deste instante a recomendação expira sozinha. */
  expiresAt?: string;
  /** Dias sem recriar depois de rejeitada ou resolvida pelo usuário. */
  cooldownDays: number;
}

export interface RuleContext {
  now: Date;
  today: ISODate;
  weekStartsOn: number;
  /** Fim (instante ISO) do dia local `date` no fuso do perfil. */
  endOfDay: (date: ISODate) => string;
  tasks: readonly {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_on: string | null;
  }[];
  reviewCards: readonly { id: string; topic_id: string; due_on: string; status: string }[];
  topicNames: ReadonlyMap<string, string>;
  /** Compromissos e blocos com horário dos próximos 7 dias (ocorrências já expandidas). */
  agenda: readonly (TimedSlot & { day: ISODate })[];
  /** Minutos planejados por dia (próximos 7 dias), já divididos na meia-noite. */
  plannedMinutesByDay: ReadonlyMap<ISODate, number>;
  dailyLoadLimitMinutes: number;
  goals: readonly {
    id: string;
    title: string;
    period: string;
    status: string;
    archived: boolean;
    startOn: ISODate;
    dueOn: ISODate | null;
    unit: string;
    cycleStart: ISODate;
    /** Fim exclusivo do ciclo; null em metas "até o prazo" sem prazo. */
    cycleEnd: ISODate | null;
    value: number;
    target: number;
  }[];
  habits: readonly {
    id: string;
    name: string;
    status: string;
    archived: boolean;
    rule: HabitRule;
    checkins: readonly Checkin[];
  }[];
  /** Tarefas concluídas nos últimos 90 dias com estimativa e tempo registrado. */
  estimates: readonly EstimatePair[] | null;
  overdueMilestones: readonly {
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    dueOn: ISODate;
  }[];
  /** Semanas (início) que já têm revisão semanal salva. */
  reviewedWeeks: ReadonlySet<ISODate>;
  /** O usuário tem algum registro (para não pedir revisão semanal de conta vazia). */
  hasAnyRecord: boolean;
}

export interface RuleDefinition {
  id: RuleId;
  title: string;
  description: string;
  /** Condição de disparo, em linguagem simples. */
  trigger: string;
  dataNeeded: string[];
  /** Amostra mínima antes de usar histórico (null = não usa histórico). */
  minSample: string | null;
  priority: string;
  closing: string;
  evaluate: (ctx: RuleContext) => Candidate[] | null;
}

export type RuleId =
  | 'review.overdue'
  | 'review.due_soon'
  | 'task.high_priority_due_soon'
  | 'task.overdue'
  | 'calendar.conflict'
  | 'goal.stalled'
  | 'day.overload'
  | 'estimate.drift'
  | 'habit.below_target'
  | 'project.milestone_overdue'
  | 'week.review_due';

const OPEN = new Set(['todo', 'in_progress']);
const br = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
const fmtMin = (m: number) => {
  const r = Math.round(m);
  const h = Math.floor(r / 60);
  const mm = r % 60;
  return h === 0
    ? `${String(mm)} min`
    : mm === 0
      ? `${String(h)} h`
      : `${String(h)} h ${String(mm)} min`;
};

// ---------------------------------------------------------------------------
// Parâmetros (documentados em docs/recommendations.md)
// ---------------------------------------------------------------------------
export const PARAMS = {
  /** Prazo "próximo" para tarefas de prioridade alta: hoje + 2 dias. */
  highPriorityHorizonDays: 2,
  /** Meta periódica parada: metade do ciclo passou e o valor ainda é 0. */
  stalledCycleFraction: 0.5,
  /** Meta "até o prazo": atrás do ritmo linear por mais de 25 pontos percentuais. */
  behindPaceMargin: 0.25,
  behindPaceMinElapsed: 0.25,
  /** Meta "até o prazo" sem prazo: 14 dias sem nenhum progresso. */
  noDueStalledDays: 14,
  /** Estimativas: mínimo de 5 tarefas comparáveis; fora de [0,67; 1,5] dispara. */
  estimateMinSample: 5,
  estimateLow: 0.67,
  estimateHigh: 1.5,
  /** Hábitos: janela de 28 dias, mínimo de 8 períodos elegíveis, abaixo de 60%. */
  habitWindowDays: 28,
  habitMinEligible: 8,
  habitMinRate: 0.6,
} as const;

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

const reviewOverdue: RuleDefinition = {
  id: 'review.overdue',
  title: 'Revisões atrasadas',
  description: 'Há revisões espaçadas cuja data já passou.',
  trigger: 'Pelo menos 1 cartão de revisão ativo com data anterior a hoje.',
  dataNeeded: ['review_cards (status, due_on)'],
  minSample: null,
  priority: 'Alta se houver 5+ atrasadas ou alguma com 7+ dias de atraso; senão média.',
  closing: 'Encerra sozinha quando não houver mais revisões atrasadas.',
  evaluate(ctx) {
    const overdue = ctx.reviewCards.filter((c) => c.status === 'active' && c.due_on < ctx.today);
    if (overdue.length === 0) return [];
    const oldest = overdue.reduce((min, c) => (c.due_on < min ? c.due_on : min), ctx.today);
    const lateDays = daysBetween(ctx.today, oldest);
    const names = [...new Set(overdue.map((c) => ctx.topicNames.get(c.topic_id) ?? 'tópico'))];
    return [
      {
        ruleId: 'review.overdue',
        dedupKey: 'all',
        title: plural(overdue.length, 'revisão atrasada', 'revisões atrasadas'),
        rationale: `A mais antiga estava prevista para ${br(oldest)} (${plural(lateDays, 'dia', 'dias')} de atraso). Revisar perto da data mantém o intervalo espaçado funcionando.`,
        evidence: { atrasadas: overdue.length, maisAntiga: oldest, topicos: names.slice(0, 5) },
        priority: overdue.length >= 5 || lateDays >= 7 ? 1 : 2,
        action: { kind: 'navigate', to: '/estudos/revisoes', label: 'Abrir revisões' },
        cooldownDays: 1,
      },
    ];
  },
};

const reviewDueSoon: RuleDefinition = {
  id: 'review.due_soon',
  title: 'Revisões de hoje e amanhã',
  description: 'Lembra as revisões previstas para hoje e amanhã, para reservar tempo.',
  trigger: 'Cartões ativos com data igual a hoje ou amanhã.',
  dataNeeded: ['review_cards (status, due_on)'],
  minSample: null,
  priority: 'Baixa.',
  closing: 'Encerra quando não houver revisões para hoje/amanhã; expira no fim de amanhã.',
  evaluate(ctx) {
    const tomorrow = addDays(ctx.today, 1);
    const soon = ctx.reviewCards.filter(
      (c) => c.status === 'active' && c.due_on >= ctx.today && c.due_on <= tomorrow,
    );
    if (soon.length === 0) return [];
    const today = soon.filter((c) => c.due_on === ctx.today).length;
    return [
      {
        ruleId: 'review.due_soon',
        dedupKey: `day:${ctx.today}`,
        title: `${plural(soon.length, 'revisão prevista', 'revisões previstas')} para hoje e amanhã`,
        rationale: `${plural(today, 'é', 'são')} para hoje e ${String(soon.length - today)} para amanhã. Reservar um horário evita que virem atrasadas.`,
        evidence: { hoje: today, amanha: soon.length - today },
        priority: 3,
        action: { kind: 'navigate', to: '/estudos/revisoes', label: 'Ver revisões' },
        expiresAt: ctx.endOfDay(tomorrow),
        cooldownDays: 1,
      },
    ];
  },
};

const highPriorityDueSoon: RuleDefinition = {
  id: 'task.high_priority_due_soon',
  title: 'Tarefa de prioridade alta com prazo próximo',
  description: 'Destaca cada tarefa aberta de prioridade alta que vence em até 2 dias.',
  trigger: 'Tarefa aberta, prioridade alta, prazo entre hoje e hoje + 2 dias.',
  dataNeeded: ['tasks (status, priority, due_on)'],
  minSample: null,
  priority: 'Alta.',
  closing:
    'Encerra quando a tarefa é concluída, cancelada, perde a prioridade alta ou o prazo muda.',
  evaluate(ctx) {
    const horizon = addDays(ctx.today, PARAMS.highPriorityHorizonDays);
    return ctx.tasks
      .filter(
        (t) =>
          OPEN.has(t.status) &&
          t.priority === 'high' &&
          t.due_on !== null &&
          t.due_on >= ctx.today &&
          t.due_on <= horizon,
      )
      .map((t) => {
        const days = daysBetween(t.due_on ?? ctx.today, ctx.today);
        return {
          ruleId: 'task.high_priority_due_soon' as const,
          dedupKey: `task:${t.id}:${t.due_on ?? ''}`,
          title: `“${t.title}” vence ${days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${String(days)} dias`}`,
          rationale:
            'É uma tarefa de prioridade alta ainda aberta. Se ainda não há tempo reservado para ela, vale planejar um bloco.',
          evidence: { tarefa: t.title, prazo: t.due_on, prioridade: 'alta' },
          priority: 1 as const,
          action: {
            kind: 'navigate' as const,
            to: `/tarefas?tarefa=${t.id}`,
            label: 'Abrir tarefa',
          },
          cooldownDays: 1,
        };
      });
  },
};

const taskOverdue: RuleDefinition = {
  id: 'task.overdue',
  title: 'Tarefas atrasadas',
  description: 'Resume as tarefas abertas com prazo vencido.',
  trigger: 'Pelo menos 1 tarefa aberta com prazo anterior a hoje.',
  dataNeeded: ['tasks (status, priority, due_on)'],
  minSample: null,
  priority: 'Alta se alguma for de prioridade alta; senão média.',
  closing: 'Encerra quando não houver tarefas atrasadas.',
  evaluate(ctx) {
    const overdue = ctx.tasks.filter(
      (t) => OPEN.has(t.status) && t.due_on !== null && t.due_on < ctx.today,
    );
    if (overdue.length === 0) return [];
    const high = overdue.filter((t) => t.priority === 'high').length;
    return [
      {
        ruleId: 'task.overdue',
        dedupKey: 'all',
        title: plural(overdue.length, 'tarefa atrasada', 'tarefas atrasadas'),
        rationale: `${high > 0 ? `${plural(high, 'é', 'são')} de prioridade alta. ` : ''}Revise os prazos: conclua, replaneje ou cancele o que não faz mais sentido.`,
        evidence: {
          atrasadas: overdue.length,
          prioridadeAlta: high,
          exemplos: overdue.slice(0, 5).map((t) => t.title),
        },
        priority: high > 0 ? 1 : 2,
        action: { kind: 'navigate', to: '/tarefas', label: 'Ver tarefas' },
        cooldownDays: 1,
      },
    ];
  },
};

const calendarConflict: RuleDefinition = {
  id: 'calendar.conflict',
  title: 'Conflito na agenda',
  description: 'Dois compromissos ou blocos planejados ocupam o mesmo horário nos próximos 7 dias.',
  trigger: 'Sobreposição de pelo menos 1 minuto entre itens com horário (compromissos e blocos).',
  dataNeeded: ['calendar_events e exceções (ocorrências expandidas)'],
  minSample: null,
  priority: 'Alta entre dois compromissos; média quando envolve um bloco planejado.',
  closing: 'Encerra quando um dos itens é movido ou removido; expira quando o horário passa.',
  evaluate(ctx) {
    return findConflicts(ctx.agenda)
      .filter((c) => Date.parse(c.overlapEnd) > ctx.now.getTime())
      .map((c) => {
        const day = ctx.agenda.find((s) => s.id === c.b.id)?.day ?? ctx.today;
        return {
          ruleId: 'calendar.conflict' as const,
          dedupKey: `${c.a.id}|${c.b.id}`,
          title: `Conflito em ${br(day)}: “${c.a.title}” e “${c.b.title}”`,
          rationale: `Os dois se sobrepõem por ${fmtMin(c.overlapMinutes)}. ${
            c.severity === 'commitments'
              ? 'São dois compromissos fixos: um deles precisa mudar.'
              : 'Um bloco planejado pode ser movido para outro horário livre.'
          }`,
          evidence: { dia: day, minutos: c.overlapMinutes, itens: [c.a.title, c.b.title] },
          priority: c.severity === 'commitments' ? 1 : 2,
          action: {
            kind: 'navigate' as const,
            to: `/calendario?data=${day}`,
            label: 'Abrir no calendário',
          },
          expiresAt: c.overlapEnd,
          cooldownDays: 7,
        };
      });
  },
};

const goalStalled: RuleDefinition = {
  id: 'goal.stalled',
  title: 'Meta sem progresso',
  description: 'Metas ativas que não avançaram no ciclo atual ou estão atrás do ritmo até o prazo.',
  trigger:
    'Semanal/mensal: metade do ciclo passou e o valor é 0. "Até o prazo" com prazo: pelo menos 25% do tempo passou e o progresso está mais de 25 pontos abaixo do ritmo linear. Sem prazo: 14 dias desde o início e valor 0.',
  dataNeeded: ['goals', 'public.goal_progress (valor do ciclo atual)'],
  minSample:
    'Não se aplica a metas diárias (ciclo curto demais) nem a ciclos que acabaram de começar.',
  priority: 'Média.',
  closing: 'Encerra quando a meta avança, é pausada/arquivada ou o ciclo muda.',
  evaluate(ctx) {
    const out: Candidate[] = [];
    for (const g of ctx.goals) {
      if (g.status !== 'active' || g.archived || !(g.target > 0) || g.value >= g.target) continue;
      if (g.period === 'daily') continue;
      const elapsed = daysBetween(ctx.today, g.cycleStart) + 1;
      if (g.period === 'once') {
        if (g.dueOn) {
          const total = daysBetween(g.dueOn, g.startOn) + 1;
          if (total <= 0) continue;
          const fraction = Math.min(1, elapsed / total);
          const progress = g.value / g.target;
          if (
            fraction < PARAMS.behindPaceMinElapsed ||
            progress >= fraction - PARAMS.behindPaceMargin
          )
            continue;
          out.push({
            ruleId: 'goal.stalled',
            dedupKey: `goal:${g.id}:${g.cycleStart}`,
            title: `“${g.title}” está atrás do ritmo`,
            rationale: `Passaram ${String(Math.round(fraction * 100))}% do prazo e o progresso está em ${String(Math.round(progress * 100))}%. Ajuste o plano ou a meta.`,
            evidence: { valor: g.value, alvo: g.target, unidade: g.unit, prazo: g.dueOn },
            priority: 2,
            action: { kind: 'navigate', to: '/metas', label: 'Abrir metas' },
            cooldownDays: 7,
          });
        } else if (elapsed > PARAMS.noDueStalledDays && g.value === 0) {
          out.push({
            ruleId: 'goal.stalled',
            dedupKey: `goal:${g.id}:${g.cycleStart}`,
            title: `“${g.title}” ainda não teve progresso`,
            rationale: `A meta começou há ${String(elapsed - 1)} dias e ainda não há registro que conte para ela.`,
            evidence: { valor: 0, alvo: g.target, unidade: g.unit, inicio: g.startOn },
            priority: 2,
            action: { kind: 'navigate', to: '/metas', label: 'Abrir metas' },
            cooldownDays: 7,
          });
        }
        continue;
      }
      if (!g.cycleEnd || g.value !== 0) continue;
      const total = daysBetween(g.cycleEnd, g.cycleStart);
      if (total <= 0 || elapsed / total < PARAMS.stalledCycleFraction) continue;
      out.push({
        ruleId: 'goal.stalled',
        dedupKey: `goal:${g.id}:${g.cycleStart}`,
        title: `“${g.title}” sem progresso neste ciclo`,
        rationale: `Já se passaram ${String(elapsed)} de ${String(total)} dias do ciclo e o valor continua 0 ${g.unit}.`,
        evidence: { valor: 0, alvo: g.target, unidade: g.unit, ciclo: g.cycleStart },
        priority: 2,
        action: { kind: 'navigate', to: '/metas', label: 'Abrir metas' },
        expiresAt: ctx.endOfDay(addDays(g.cycleEnd, -1)),
        cooldownDays: 3,
      });
    }
    return out;
  },
};

const dayOverload: RuleDefinition = {
  id: 'day.overload',
  title: 'Dia sobrecarregado',
  description: 'O tempo planejado num dia passa do limite diário definido no planejamento.',
  trigger:
    'Compromissos + blocos com horário somam mais que o limite diário (padrão 8 h), hoje ou nos próximos 6 dias.',
  dataNeeded: ['calendar_events (ocorrências)', 'planning_preferences.daily_load_limit_minutes'],
  minSample: null,
  priority: 'Média.',
  closing: 'Encerra quando a carga volta ao limite; expira no fim do dia.',
  evaluate(ctx) {
    const out: Candidate[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(ctx.today, i);
      const minutes = ctx.plannedMinutesByDay.get(day) ?? 0;
      if (minutes <= ctx.dailyLoadLimitMinutes) continue;
      out.push({
        ruleId: 'day.overload',
        dedupKey: `day:${day}`,
        title: `${i === 0 ? 'Hoje' : br(day)} tem ${fmtMin(minutes)} planejadas`,
        rationale: `Passa do seu limite diário de ${fmtMin(ctx.dailyLoadLimitMinutes)}. Considere mover blocos flexíveis para outro dia.`,
        evidence: {
          dia: day,
          planejadoMin: Math.round(minutes),
          limiteMin: ctx.dailyLoadLimitMinutes,
        },
        priority: 2,
        action: { kind: 'navigate', to: `/calendario?data=${day}`, label: 'Abrir o dia' },
        expiresAt: ctx.endOfDay(day),
        cooldownDays: 1,
      });
    }
    return out;
  },
};

const estimateDrift: RuleDefinition = {
  id: 'estimate.drift',
  title: 'Estimativas sistematicamente diferentes do realizado',
  description: 'Compara o tempo registrado nas tarefas concluídas com a estimativa.',
  trigger: `Mediana de realizado ÷ estimado fora de [${String(PARAMS.estimateLow)}; ${String(PARAMS.estimateHigh)}] nas tarefas concluídas dos últimos 90 dias.`,
  dataNeeded: ['tasks (estimate_minutes, completed_at)', 'activities.task_id (tempo realizado)'],
  minSample: `${String(PARAMS.estimateMinSample)} tarefas concluídas com estimativa E tempo registrado.`,
  priority: 'Baixa.',
  closing: 'Encerra quando a mediana volta à faixa; após rejeitar, espera 14 dias.',
  evaluate(ctx) {
    if (ctx.estimates === null) return null;
    const acc = estimateAccuracy(ctx.estimates);
    if (acc.withTime < PARAMS.estimateMinSample || acc.medianRatio === null) return null;
    const r = acc.medianRatio;
    if (r >= PARAMS.estimateLow && r <= PARAMS.estimateHigh) return [];
    const over = r > PARAMS.estimateHigh;
    const ratio = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(r);
    return [
      {
        ruleId: 'estimate.drift',
        dedupKey: over ? 'over' : 'under',
        title: over
          ? `Suas tarefas levam cerca de ${ratio}× o tempo estimado`
          : `Suas tarefas levam cerca de ${ratio}× o tempo estimado (menos que o previsto)`,
        rationale: `Mediana de ${String(acc.withTime)} tarefas concluídas nos últimos 90 dias com tempo registrado. ${
          over
            ? 'Ao planejar, considere aumentar as estimativas ou reservar blocos maiores.'
            : 'Talvez dê para reservar menos tempo por tarefa.'
        }`,
        evidence: {
          amostra: acc.withTime,
          medianaRazao: Math.round(r * 100) / 100,
          estimadoMin: acc.totalEstimateMinutes,
          realizadoMin: acc.totalActualMinutes,
        },
        priority: 3,
        action: { kind: 'navigate', to: '/analises?aba=tarefas', label: 'Ver análise' },
        cooldownDays: 14,
      },
    ];
  },
};

const habitBelowTarget: RuleDefinition = {
  id: 'habit.below_target',
  title: 'Hábito abaixo da frequência planejada',
  description:
    'Hábitos ativos cumpridos em menos de 60% dos dias/semanas esperados nos últimos 28 dias.',
  trigger: `Consistência < ${String(PARAMS.habitMinRate * 100)}% nos últimos ${String(PARAMS.habitWindowDays)} dias.`,
  dataNeeded: ['habits (agenda, meta por marcação)', 'habit_checkins'],
  minSample: `${String(PARAMS.habitMinEligible)} dias (ou semanas) elegíveis na janela; para hábitos semanais, 4 semanas completas.`,
  priority: 'Baixa.',
  closing: 'Encerra quando a consistência volta a 60% ou mais; após rejeitar, espera 7 dias.',
  evaluate(ctx) {
    const out: Candidate[] = [];
    const from = addDays(ctx.today, -(PARAMS.habitWindowDays - 1));
    for (const h of ctx.habits) {
      if (h.status !== 'active' || h.archived) continue;
      const c = consistencyInRange(
        h.rule,
        h.checkins,
        from,
        addDays(ctx.today, 1),
        ctx.today,
        ctx.weekStartsOn,
      );
      const minEligible = c.unit === 'weeks' ? 4 : PARAMS.habitMinEligible;
      if (c.eligible < minEligible || c.rate === null || c.rate >= PARAMS.habitMinRate) continue;
      out.push({
        ruleId: 'habit.below_target',
        dedupKey: `habit:${h.id}`,
        title: `“${h.name}” cumprido em ${String(Math.round(c.rate * 100))}% ${c.unit === 'weeks' ? 'das semanas' : 'dos dias'}`,
        rationale: `${String(c.met)} de ${String(c.eligible)} ${c.unit === 'weeks' ? 'semanas' : 'dias'} esperados nos últimos ${String(PARAMS.habitWindowDays)} dias. Talvez a frequência planejada esteja alta, ou falte um horário fixo.`,
        evidence: { cumpridos: c.met, esperados: c.eligible, janelaDias: PARAMS.habitWindowDays },
        priority: 3,
        action: { kind: 'navigate', to: '/habitos', label: 'Abrir hábitos' },
        cooldownDays: 7,
      });
    }
    return out;
  },
};

const milestoneOverdue: RuleDefinition = {
  id: 'project.milestone_overdue',
  title: 'Marco de projeto atrasado',
  description: 'Marcos não concluídos com data anterior a hoje em projetos ativos.',
  trigger:
    'Marco sem conclusão e com data < hoje, em projeto não arquivado e não concluído/cancelado.',
  dataNeeded: ['project_milestones', 'projects'],
  minSample: null,
  priority: 'Média.',
  closing: 'Encerra quando o marco é concluído, a data muda ou o projeto é encerrado.',
  evaluate(ctx) {
    return ctx.overdueMilestones.map((m) => ({
      ruleId: 'project.milestone_overdue' as const,
      dedupKey: `milestone:${m.id}:${m.dueOn}`,
      title: `Marco “${m.title}” (${m.projectName}) está atrasado`,
      rationale: `A data prevista era ${br(m.dueOn)}. Conclua o marco ou ajuste a data para o planejamento do projeto continuar realista.`,
      evidence: { projeto: m.projectName, marco: m.title, data: m.dueOn },
      priority: 2 as const,
      action: { kind: 'navigate' as const, to: `/projetos/${m.projectId}`, label: 'Abrir projeto' },
      cooldownDays: 3,
    }));
  },
};

const weekReviewDue: RuleDefinition = {
  id: 'week.review_due',
  title: 'Revisão semanal pendente',
  description: 'Sugere revisar a semana no último dia dela e nos dois primeiros dias da seguinte.',
  trigger:
    'Hoje é o último dia da semana (ou um dos 2 primeiros da próxima) e a semana ainda não tem revisão salva.',
  dataNeeded: ['weekly_reviews (week_start)', 'perfil (início da semana)'],
  minSample: 'Só para contas com algum registro.',
  priority: 'Baixa.',
  closing: 'Encerra ao salvar a revisão da semana; expira 2 dias depois do fim da semana.',
  evaluate(ctx) {
    if (!ctx.hasAnyRecord) return [];
    const weekStartOf = (d: ISODate) => {
      const [y = 1970, m = 1, dd = 1] = d.split('-').map(Number);
      const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
      return addDays(d, -((wd - ctx.weekStartsOn + 7) % 7));
    };
    const thisWeek = weekStartOf(ctx.today);
    const dayIndex = daysBetween(ctx.today, thisWeek);
    const target = dayIndex === 6 ? thisWeek : dayIndex <= 1 ? addDays(thisWeek, -7) : null;
    if (!target || ctx.reviewedWeeks.has(target)) return [];
    return [
      {
        ruleId: 'week.review_due',
        dedupKey: `week:${target}`,
        title: `Revise a semana de ${br(target)} a ${br(addDays(target, 6))}`,
        rationale:
          'Comparar o planejado com o realizado e escolher as prioridades da próxima semana ajuda a manter o plano realista.',
        evidence: { semana: target },
        priority: 3,
        action: {
          kind: 'navigate',
          to: `/analises/semana?semana=${target}`,
          label: 'Fazer revisão',
        },
        expiresAt: ctx.endOfDay(addDays(target, 8)),
        cooldownDays: 3,
      },
    ];
  },
};

export const RULES: readonly RuleDefinition[] = [
  reviewOverdue,
  reviewDueSoon,
  highPriorityDueSoon,
  taskOverdue,
  calendarConflict,
  goalStalled,
  dayOverload,
  estimateDrift,
  habitBelowTarget,
  milestoneOverdue,
  weekReviewDue,
];

export function ruleById(id: string): RuleDefinition | undefined {
  return RULES.find((r) => r.id === id);
}

export interface Evaluation {
  candidates: Candidate[];
  /** Regras avaliadas com dados suficientes (as únicas cujas recomendações podem ser encerradas). */
  evaluated: RuleId[];
  /** Regras puladas por falta de dados. */
  insufficient: RuleId[];
}

/** Avalia regras; `available` limita às regras cujos dados foram carregados. */
export function evaluateRules(
  ctx: RuleContext,
  available: ReadonlySet<RuleId> = new Set(RULES.map((r) => r.id)),
): Evaluation {
  const candidates: Candidate[] = [];
  const evaluated: RuleId[] = [];
  const insufficient: RuleId[] = [];
  for (const rule of RULES) {
    if (!available.has(rule.id)) continue;
    const result = rule.evaluate(ctx);
    if (result === null) {
      insufficient.push(rule.id);
      continue;
    }
    evaluated.push(rule.id);
    // Garantia extra de deduplicação dentro da mesma avaliação.
    const seen = new Set<string>();
    for (const c of result) {
      const key = `${c.ruleId}|${c.dedupKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(c);
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return { candidates, evaluated, insufficient };
}
