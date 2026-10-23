/**
 * Agenda com horário (compromissos e blocos) numa janela — usada pelo detector de conflitos,
 * pelo planejador, pelas recomendações e pela revisão semanal. Itens de dia inteiro não
 * ocupam horário e ficam de fora.
 */
import { localDateIn } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import type { TimedSlot } from './conflicts';
import { plannedMinutesByDay } from './conflicts';
import {
  toException,
  toSeries,
  type CalendarEvent,
  type CalendarException,
} from './calendar-items';
import { expandEvent } from './recurrence';

export interface AgendaSlot extends TimedSlot {
  eventId: string;
  eventKind: string;
  subjectId: string | null;
  taskId: string | null;
  categoryId: string | null;
  /** Dia local (fuso do perfil) do início. */
  day: string;
}

export function expandAgenda(
  events: readonly CalendarEvent[],
  exceptions: readonly CalendarException[],
  windowStart: string,
  windowEnd: string,
  timezone: string,
): AgendaSlot[] {
  const ex = exceptions.map(toException);
  const out: AgendaSlot[] = [];
  for (const e of events) {
    if (e.all_day) continue;
    for (const occ of expandEvent(toSeries(e), ex, windowStart, windowEnd)) {
      if (occ.allDay) continue;
      out.push({
        id: `ev:${e.id}:${occ.key}`,
        title: occ.title ?? e.title,
        start: occ.start,
        end: occ.end,
        kind: e.kind === 'event' ? 'event' : 'block',
        eventId: e.id,
        eventKind: e.kind,
        subjectId: e.subject_id,
        taskId: e.task_id,
        categoryId: e.category_id,
        day: localDateIn(new Date(occ.start), timezone),
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function minutesByDay(slots: readonly TimedSlot[], timezone: string): Map<string, number> {
  return plannedMinutesByDay(
    slots,
    (ms) => localDateIn(new Date(ms), timezone),
    (day) => zonedToUtc(day, '00:00', timezone).getTime(),
  );
}
