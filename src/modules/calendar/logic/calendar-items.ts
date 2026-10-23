/**
 * Monta os itens do calendário a partir de fontes DIFERENTES, sem misturá-las:
 *
 *  - eventos e blocos PLANEJADOS (calendar_events, com recorrência expandida sob demanda);
 *  - PRAZOS de tarefas (derivados de tasks.due_on — não são eventos);
 *  - REVISÕES previstas (review_cards.due_on);
 *  - tempo REALIZADO (atividades de sessões de foco) — apenas leitura.
 *
 * O calendário trabalha em "horário de parede" do fuso do PERFIL: o FullCalendar roda em
 * UTC e recebe horários locais como se fossem UTC. Assim a grade mostra o fuso do perfil
 * mesmo que o navegador esteja em outro (ADR-026).
 */
import { addDays, type ISODate } from '@/lib/date';
import { isoDateFromParts, zonedParts, zonedToUtc } from '@/lib/zoned';
import type { Tables } from '@/services/supabase/database.types';
import { expandEvent, type EventException, type EventSeries, type Occurrence } from './recurrence';

export type CalendarEvent = Tables<'calendar_events'>;
export type CalendarException = Tables<'calendar_event_exceptions'>;

export type ItemSource = 'event' | 'block' | 'task_due' | 'review' | 'done';

export const SOURCE_LABELS: Record<ItemSource, string> = {
  event: 'Compromissos',
  block: 'Blocos planejados',
  task_due: 'Prazos de tarefas',
  review: 'Revisões',
  done: 'Tempo realizado',
};

export const KIND_LABELS: Record<string, string> = {
  event: 'Compromisso',
  study: 'Bloco de estudo',
  task: 'Bloco de tarefa',
  habit: 'Bloco de hábito',
};

/** Instante → "AAAA-MM-DDTHH:mm:ss" no fuso (lido pelo FullCalendar como UTC). */
export function toWall(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${isoDateFromParts(p)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** Data do FullCalendar (UTC de parede) → instante real no fuso do perfil. */
export function fromWall(date: Date, timeZone: string): string {
  const iso = date.toISOString();
  return zonedToUtc(iso.slice(0, 10), iso.slice(11, 16), timeZone).toISOString();
}

/** Data do FullCalendar (UTC de parede) → data de calendário. */
export function wallDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function toSeries(e: CalendarEvent): EventSeries {
  return {
    id: e.id,
    allDay: e.all_day,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    startDate: e.start_date,
    endDate: e.end_date,
    timezone: e.timezone,
    recurrenceRule: e.recurrence_rule,
  };
}

export function toException(x: CalendarException): EventException {
  return {
    eventId: x.event_id,
    originalStartsAt: x.original_starts_at,
    originalDate: x.original_date,
    kind: x.kind === 'cancelled' ? 'cancelled' : 'modified',
    newTitle: x.new_title,
    newStartsAt: x.new_starts_at,
    newEndsAt: x.new_ends_at,
  };
}

export interface CalendarItem {
  id: string;
  source: ItemSource;
  title: string;
  allDay: boolean;
  /** Horário de parede (timed) ou data (dia inteiro, fim exclusivo). */
  start: string;
  end: string;
  editable: boolean;
  /** Referências para abrir o detalhe certo. */
  eventId?: string;
  occurrence?: Occurrence;
  taskId?: string;
  reviewId?: string;
  activityId?: string;
}

export interface CalendarInputs {
  events: readonly CalendarEvent[];
  exceptions: readonly CalendarException[];
  tasks: readonly Pick<Tables<'tasks'>, 'id' | 'title' | 'due_on' | 'status'>[];
  reviews: readonly Pick<Tables<'review_cards'>, 'id' | 'topic_id' | 'due_on' | 'status'>[];
  topicNames: Map<string, string>;
  activities: readonly Pick<
    Tables<'activities'>,
    'id' | 'title' | 'started_at' | 'ended_at' | 'session_id'
  >[];
  timeZone: string;
  /** Janela visível: instantes reais e datas locais [fromDate, toDate). */
  windowStart: string;
  windowEnd: string;
  fromDate: ISODate;
  toDate: ISODate;
}

export function buildCalendarItems(input: CalendarInputs): CalendarItem[] {
  const items: CalendarItem[] = [];
  const exceptions = input.exceptions.map(toException);
  for (const event of input.events) {
    const source: ItemSource = event.kind === 'event' ? 'event' : 'block';
    for (const occ of expandEvent(
      toSeries(event),
      exceptions,
      input.windowStart,
      input.windowEnd,
    )) {
      items.push({
        id: `ev:${event.id}:${occ.key}`,
        source,
        title: occ.title ?? event.title,
        allDay: occ.allDay,
        start: occ.allDay ? occ.start : toWall(occ.start, input.timeZone),
        end: occ.allDay ? occ.end : toWall(occ.end, input.timeZone),
        editable: !occ.unsupportedRule,
        eventId: event.id,
        occurrence: occ,
      });
    }
  }
  for (const t of input.tasks) {
    if (!t.due_on || t.due_on < input.fromDate || t.due_on >= input.toDate) continue;
    if (t.status === 'cancelled') continue;
    items.push({
      id: `task:${t.id}`,
      source: 'task_due',
      title: `${t.status === 'done' ? '✓ ' : ''}Prazo: ${t.title}`,
      allDay: true,
      start: t.due_on,
      end: addDays(t.due_on, 1),
      editable: false,
      taskId: t.id,
    });
  }
  for (const r of input.reviews) {
    if (r.status !== 'active' || r.due_on < input.fromDate || r.due_on >= input.toDate) continue;
    items.push({
      id: `review:${r.id}`,
      source: 'review',
      title: `Revisão: ${input.topicNames.get(r.topic_id) ?? 'tópico'}`,
      allDay: true,
      start: r.due_on,
      end: addDays(r.due_on, 1),
      editable: false,
      reviewId: r.id,
    });
  }
  for (const a of input.activities) {
    if (!a.session_id) continue;
    items.push({
      id: `act:${a.id}`,
      source: 'done',
      title: `Realizado: ${a.title}`,
      allDay: false,
      start: toWall(a.started_at, input.timeZone),
      end: toWall(a.ended_at, input.timeZone),
      editable: false,
      activityId: a.id,
    });
  }
  return items;
}

/**
 * Tempo REALIZADO dentro de um bloco planejado: atividades da mesma matéria/tarefa que se
 * sobrepõem ao intervalo, proporcional à sobreposição. Planejado e realizado nunca se misturam;
 * um bloco não conclui tarefa nenhuma.
 */
export function actualSecondsInBlock(
  block: { start: string; end: string; subjectId: string | null; taskId: string | null },
  activities: readonly Pick<
    Tables<'activities'>,
    'started_at' | 'ended_at' | 'duration_seconds' | 'subject_id' | 'task_id'
  >[],
): number {
  if (!block.subjectId && !block.taskId) return 0;
  const bs = Date.parse(block.start);
  const be = Date.parse(block.end);
  let total = 0;
  for (const a of activities) {
    const matches =
      (block.subjectId && a.subject_id === block.subjectId) ||
      (block.taskId && a.task_id === block.taskId);
    if (!matches) continue;
    const as = Date.parse(a.started_at);
    const ae = Date.parse(a.ended_at);
    const overlap = Math.min(be, ae) - Math.max(bs, as);
    if (overlap <= 0 || ae <= as) continue;
    total += a.duration_seconds * (overlap / (ae - as));
  }
  return Math.round(total);
}
