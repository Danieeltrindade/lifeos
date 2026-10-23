import { addDays, type ISODate } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import { useCheckinsQuery, useHabitsQuery } from '@/services/data/queries';
import { useDataSource } from '@/services/data-source/data-source-context';
import type { AgendaItem, AgendaItemKind } from '@/types/domain';
import { toCheckins, toRule } from '@/modules/habits/data/habit-api';
import { isDueToday, isMet } from '@/modules/habits/logic/habits';
import { useCalendarRangeQuery } from '@/modules/calendar/data/calendar-api';
import { toException, toSeries } from '@/modules/calendar/logic/calendar-items';
import { expandEvent } from '@/modules/calendar/logic/recurrence';
import { buildDemoAgenda } from './data/demo-dashboard';

export interface HabitToday {
  id: string;
  name: string;
  done: boolean;
}

export interface TodayPlan {
  status: 'loading' | 'error' | 'ready';
  agenda: AgendaItem[];
  /** Minutos de blocos de ESTUDO planejados hoje (parte que cai dentro do dia). */
  plannedStudyMinutes: number;
  habits: HabitToday[];
}

const KINDS: AgendaItemKind[] = ['event', 'study', 'task', 'habit'];

/**
 * Plano de hoje montado na interface com as MESMAS regras do calendário (recorrência no fuso
 * do evento, dia de 23/25 h) e dos hábitos (dias elegíveis). Assim o dashboard e as telas de
 * origem nunca divergem.
 */
export function useTodayPlan(
  today: ISODate,
  timezone: string,
  weekStartsOn: number,
  now: Date,
): TodayPlan {
  const { mode } = useDataSource();
  const real = mode === 'supabase';
  const dayStart = zonedToUtc(today, '00:00', timezone).toISOString();
  const dayEnd = zonedToUtc(addDays(today, 1), '00:00', timezone).toISOString();
  const calendar = useCalendarRangeQuery(dayStart, dayEnd, today, addDays(today, 1));
  const habits = useHabitsQuery();
  const checkins = useCheckinsQuery(addDays(today, -7));

  if (!real) {
    const agenda =
      import.meta.env.DEV && (mode === 'demo' || mode === 'simulate-slow')
        ? buildDemoAgenda(now)
        : [];
    return {
      status: 'ready',
      agenda,
      plannedStudyMinutes: plannedStudy(agenda, dayStart, dayEnd),
      habits:
        agenda.length > 0
          ? [
              { id: 'demo-hb-1', name: 'Ler 20 páginas', done: false },
              { id: 'demo-hb-2', name: 'Caminhar', done: true },
            ]
          : [],
    };
  }

  const status =
    calendar.status === 'error' || habits.status === 'error' || checkins.status === 'error'
      ? 'error'
      : calendar.status === 'pending' ||
          habits.status === 'pending' ||
          checkins.status === 'pending'
        ? 'loading'
        : 'ready';

  const agenda: AgendaItem[] = [];
  const exceptions = (calendar.data?.exceptions ?? []).map(toException);
  for (const e of calendar.data?.events ?? []) {
    for (const occ of expandEvent(toSeries(e), exceptions, dayStart, dayEnd)) {
      agenda.push({
        id: `${e.id}:${occ.key}`,
        title: occ.title ?? e.title,
        kind: (KINDS as string[]).includes(e.kind) ? (e.kind as AgendaItemKind) : 'event',
        allDay: occ.allDay,
        plannedStart: occ.allDay
          ? zonedToUtc(occ.start, '00:00', timezone).toISOString()
          : occ.start,
        plannedEnd: occ.allDay ? zonedToUtc(occ.end, '00:00', timezone).toISOString() : occ.end,
      });
    }
  }

  const habitsToday: HabitToday[] = (habits.data ?? [])
    .filter((h) => h.archived_at === null && h.status === 'active')
    .filter((h) =>
      isDueToday(toRule(h), toCheckins(checkins.data ?? [], h.id), today, weekStartsOn),
    )
    .map((h) => {
      const c = (checkins.data ?? []).find((x) => x.habit_id === h.id && x.local_date === today);
      return {
        id: h.id,
        name: h.name,
        done: isMet(toRule(h), c ? { localDate: today, value: c.value } : undefined),
      };
    });

  return {
    status,
    agenda,
    plannedStudyMinutes: plannedStudy(agenda, dayStart, dayEnd),
    habits: habitsToday,
  };
}

function plannedStudy(agenda: AgendaItem[], dayStart: string, dayEnd: string): number {
  const ds = Date.parse(dayStart);
  const de = Date.parse(dayEnd);
  let ms = 0;
  for (const item of agenda) {
    if (item.kind !== 'study' || item.allDay) continue;
    const overlap =
      Math.min(de, Date.parse(item.plannedEnd)) - Math.max(ds, Date.parse(item.plannedStart));
    if (overlap > 0) ms += overlap;
  }
  return Math.round(ms / 60_000);
}
