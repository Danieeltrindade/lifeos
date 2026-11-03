import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import type { DateSelectArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { AlertTriangle, Plus, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router';
import { buttonClasses } from '@/components/ui/button-classes';
import { FilterSelect } from '@/components/ui/SearchField';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays } from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import { startOfWeek, zonedToUtc } from '@/lib/zoned';
import {
  useActivitiesQuery,
  useCategoriesQuery,
  useHabitsQuery,
  useReviewCardsQuery,
  useSubjectsQuery,
  useTasksQuery,
  useTopicsQuery,
} from '@/services/data/queries';
import { EventDetail } from './components/EventDetail';
import { EventForm, type EventDraft, type SplitEdit } from './components/EventForm';
import { OccurrenceForm } from './components/OccurrenceForm';
import { findConflicts } from './logic/conflicts';
import { useCalendarRangeQuery, useEventMutations } from './data/calendar-api';
import {
  buildCalendarItems,
  fromWall,
  SOURCE_LABELS,
  toWall,
  wallDate,
  type CalendarItem,
  type ItemSource,
} from './logic/calendar-items';

const ALL_SOURCES: ItemSource[] = ['event', 'block', 'task_due', 'review', 'done'];

const SOURCE_CLASSES: Record<ItemSource, string> = {
  event: 'lo-ev-event',
  block: 'lo-ev-block',
  task_due: 'lo-ev-task',
  review: 'lo-ev-review',
  done: 'lo-ev-done',
};

type DialogState =
  | null
  | { mode: 'create'; draft?: EventDraft }
  | { mode: 'view'; itemId: string }
  | { mode: 'edit'; eventId: string }
  | { mode: 'occurrence'; itemId: string }
  | { mode: 'split'; eventId: string; split: SplitEdit };

function initialView(): string {
  try {
    return window.matchMedia('(max-width: 640px)').matches ? 'timeGridDay' : 'timeGridWeek';
  } catch {
    return 'timeGridWeek';
  }
}

/** Altura da grade de horários: cabe na tela sem empurrar o resto da página. */
function timeGridHeight(): number {
  if (typeof window === 'undefined') return 720;
  return Math.round(Math.max(520, Math.min(820, window.innerHeight - 220)));
}

export function CalendarPage() {
  const { today, timezone, weekStartsOn } = useUserCalendar();
  const toast = useToast();
  const [params] = useSearchParams();
  const dateParam = params.get('data');
  const initialDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const [range, setRange] = useState(() => {
    const from = startOfWeek(initialDate, weekStartsOn);
    return { fromDate: from, toDate: addDays(from, 7) };
  });
  const [viewType, setViewType] = useState(initialView);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [hidden, setHidden] = useState<Set<ItemSource>>(new Set());
  const calendarBox = useRef<HTMLDivElement>(null);
  useDecorativeCalendarIcons(calendarBox);
  const [dialog, setDialog] = useState<DialogState>(null);
  const windowStart = zonedToUtc(range.fromDate, '00:00', timezone).toISOString();
  const windowEnd = zonedToUtc(range.toDate, '00:00', timezone).toISOString();

  const calendar = useCalendarRangeQuery(windowStart, windowEnd, range.fromDate, range.toDate);
  const activities = useActivitiesQuery(windowStart, windowEnd);
  const tasks = useTasksQuery().data ?? [];
  const reviews = useReviewCardsQuery().data ?? [];
  const topics = useTopicsQuery().data ?? [];
  const subjects = useSubjectsQuery().data ?? [];
  const habits = useHabitsQuery().data ?? [];
  const categories = useCategoriesQuery().data ?? [];
  const { update, exception } = useEventMutations();

  const items = calendar.data
    ? buildCalendarItems({
        events: calendar.data.events,
        exceptions: calendar.data.exceptions,
        tasks,
        reviews,
        topicNames: new Map(topics.map((t) => [t.id, t.name])),
        activities: activities.data ?? [],
        timeZone: timezone,
        windowStart,
        windowEnd,
        fromDate: range.fromDate,
        toDate: range.toDate,
      })
    : [];
  const byId = new Map(items.map((i) => [i.id, i]));

  const eventById = new Map((calendar.data?.events ?? []).map((e) => [e.id, e]));
  const topicSubject = new Map(topics.map((t) => [t.id, t.subject_id]));
  const reviewSubject = new Map(reviews.map((r) => [r.id, topicSubject.get(r.topic_id) ?? null]));
  const passesFilters = (i: CalendarItem) => {
    if (hidden.has(i.source)) return false;
    const ev = i.eventId ? eventById.get(i.eventId) : undefined;
    if (categoryFilter !== 'all') {
      if (i.source !== 'event' && i.source !== 'block') return false;
      if ((ev?.category_id ?? 'none') !== categoryFilter) return false;
    }
    if (subjectFilter !== 'all') {
      const subject = ev
        ? ev.subject_id
        : i.reviewId
          ? (reviewSubject.get(i.reviewId) ?? null)
          : null;
      if ((subject ?? 'none') !== subjectFilter) return false;
    }
    return true;
  };

  // Conflitos: só compromissos e blocos com horário (prazos, revisões e o realizado não ocupam agenda).
  const conflicts = findConflicts(
    items.flatMap((i) =>
      (i.source === 'event' || i.source === 'block') && !i.allDay && i.occurrence
        ? [
            {
              id: i.id,
              title: i.title,
              start: i.occurrence.start,
              end: i.occurrence.end,
              kind: i.source,
            },
          ]
        : [],
    ),
  );
  const conflictPartners = new Map<string, string[]>();
  for (const c of conflicts) {
    conflictPartners.set(c.a.id, [...(conflictPartners.get(c.a.id) ?? []), c.b.title]);
    conflictPartners.set(c.b.id, [...(conflictPartners.get(c.b.id) ?? []), c.a.title]);
  }

  const colorOf = (i: CalendarItem): string | undefined => {
    const ev = i.eventId ? eventById.get(i.eventId) : undefined;
    if (!ev) return undefined;
    const cat = categories.find((c) => c.id === ev.category_id);
    if (cat?.color) return cat.color;
    const subject = subjects.find((x) => x.id === ev.subject_id);
    return subject?.color ?? undefined;
  };

  const fcEvents: EventInput[] = items.filter(passesFilters).map((i) => {
    const color = colorOf(i);
    const conflicted = conflictPartners.has(i.id);
    return {
      id: i.id,
      title: conflicted ? `⚠ ${i.title}` : i.title,
      start: i.start,
      end: i.end,
      allDay: i.allDay,
      editable: i.editable && !(i.allDay && i.occurrence?.isRecurring),
      classNames: [SOURCE_CLASSES[i.source], ...(conflicted ? ['lo-ev-conflict'] : [])],
      ...(color ? { borderColor: color } : {}),
    };
  });

  const eventOf = (item: CalendarItem | undefined) =>
    item?.eventId ? calendar.data?.events.find((e) => e.id === item.eventId) : undefined;

  /** Arrastar/redimensionar: grava no banco; recorrente vira exceção desta ocorrência. */
  const onMove = (arg: EventDropArg | EventResizeDoneArg) => {
    const item = byId.get(arg.event.id);
    const ev = eventOf(item);
    const start = arg.event.start;
    if (!item || !ev || !start) {
      arg.revert();
      return;
    }
    const allDay = arg.event.allDay;
    const end = arg.event.end ?? new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
    const onError = () => {
      arg.revert();
    };
    if (item.occurrence?.isRecurring) {
      if (allDay) {
        arg.revert();
        return;
      }
      exception.mutate(
        {
          event_id: ev.id,
          kind: 'modified',
          original_starts_at: item.occurrence.key,
          original_date: null,
          new_starts_at: fromWall(start, timezone),
          new_ends_at: fromWall(end, timezone),
        },
        {
          onError,
          onSuccess: () => {
            toast.show({
              tone: 'info',
              message: 'Só esta ocorrência foi movida; a série continua igual.',
            });
          },
        },
      );
      return;
    }
    update.mutate(
      {
        id: ev.id,
        patch: allDay
          ? {
              all_day: true,
              starts_at: null,
              ends_at: null,
              start_date: wallDate(start),
              end_date: wallDate(end),
            }
          : {
              all_day: false,
              start_date: null,
              end_date: null,
              starts_at: fromWall(start, timezone),
              ends_at: fromWall(end, timezone),
            },
      },
      { onError },
    );
  };

  const viewItem =
    dialog?.mode === 'view' || dialog?.mode === 'occurrence' ? byId.get(dialog.itemId) : undefined;
  const editEvent =
    dialog?.mode === 'edit' || dialog?.mode === 'split'
      ? calendar.data?.events.find((e) => e.id === dialog.eventId)
      : dialog?.mode === 'occurrence'
        ? eventOf(viewItem)
        : undefined;

  return (
    <div className="animate-fade-up">
      <PageHeader
        module="calendar"
        eyebrow={<span className="inline-flex items-center gap-2">Planejar</span>}
        title="Calendário"
        description="Compromissos e blocos planejados ao lado de prazos, revisões e do tempo realizado."
        actions={
          <>
            <Link to="/calendario/planejar" className={buttonClasses('secondary', 'md')}>
              <Wand2 aria-hidden="true" className="size-4" />
              Planejar semana
            </Link>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDialog({ mode: 'create' });
              }}
            >
              Novo evento
            </Button>
          </>
        }
      />
      <fieldset className="mb-4 flex flex-wrap gap-2">
        <legend className="sr-only">Mostrar no calendário</legend>
        {ALL_SOURCES.map((s) => (
          <label
            key={s}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-body-sm"
          >
            <input
              type="checkbox"
              className="accent-[var(--lo-primary)]"
              checked={!hidden.has(s)}
              onChange={() => {
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(s)) next.delete(s);
                  else next.add(s);
                  return next;
                });
              }}
            />
            <span aria-hidden="true" className={`size-2.5 rounded-full ${SOURCE_CLASSES[s]}-dot`} />
            {SOURCE_LABELS[s]}
          </label>
        ))}
      </fieldset>
      <div className="mb-4 grid max-w-xl grid-cols-2 gap-2">
        <FilterSelect
          label="Categoria"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'none', label: 'Sem categoria' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <FilterSelect
          label="Matéria"
          value={subjectFilter}
          onChange={setSubjectFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'none', label: 'Sem matéria' },
            ...subjects.map((x) => ({ value: x.id, label: x.name })),
          ]}
        />
      </div>
      {conflicts.length > 0 && (
        <Notice
          tone="warning"
          title={`${String(conflicts.length)} conflito(s) de horário nesta visualização`}
          className="mb-4"
        >
          <ul className="mt-1 flex flex-col gap-0.5">
            {conflicts.slice(0, 5).map((c) => (
              <li key={`${c.a.id}|${c.b.id}`} className="inline-flex items-start gap-1">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />“
                {c.a.title}” e “{c.b.title}” se sobrepõem por {String(c.overlapMinutes)} min
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Itens em conflito aparecem com ⚠ e contorno tracejado. Nada é movido automaticamente.
          </p>
        </Notice>
      )}
      {calendar.status === 'error' && (
        <div className="mb-4">
          <ErrorState
            title="Não foi possível carregar o calendário"
            description={errorMessage(calendar.error)}
            onRetry={() => {
              void calendar.refetch();
            }}
          />
        </div>
      )}
      <div
        ref={calendarBox}
        className="lo-calendar rounded-lg border border-border surface-card p-2 shadow-elev-1 sm:p-4"
        aria-busy={calendar.isFetching}
      >
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={ptBrLocale}
          timeZone="UTC"
          now={() => toWall(new Date().toISOString(), timezone)}
          firstDay={weekStartsOn}
          initialView={initialView()}
          initialDate={initialDate}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' }}
          // Dicas (e nomes acessíveis das setas) com concordância: "Próxima semana".
          buttonHints={{ prev: navHint('prev'), next: navHint('next'), today: 'Ir para hoje' }}
          // Semana e dia: altura fixa com rolagem interna, abrindo às 07:00 (antes a grade de
          // 24 h começava à meia-noite e o horário útil ficava abaixo da dobra). Mês: altura livre.
          height={viewType.startsWith('timeGrid') ? timeGridHeight() : 'auto'}
          nowIndicator
          selectable
          selectMirror
          editable
          eventResizableFromStart
          dayMaxEventRows={4}
          slotDuration="00:30:00"
          scrollTime="07:00:00"
          events={fcEvents}
          datesSet={(arg) => {
            if (arg.view.type !== viewType) setViewType(arg.view.type);
            const fromDate = wallDate(arg.start);
            const toDate = wallDate(arg.end);
            if (fromDate !== range.fromDate || toDate !== range.toDate)
              setRange({ fromDate, toDate });
          }}
          select={(arg: DateSelectArg) => {
            arg.view.calendar.unselect();
            setDialog({
              mode: 'create',
              draft: arg.allDay
                ? { allDay: true, start: wallDate(arg.start), end: wallDate(arg.end) }
                : {
                    allDay: false,
                    start: fromWall(arg.start, timezone),
                    end: fromWall(arg.end, timezone),
                  },
            });
          }}
          eventClick={(arg: EventClickArg) => {
            arg.jsEvent.preventDefault();
            setDialog({ mode: 'view', itemId: arg.event.id });
          }}
          eventDrop={onMove}
          eventResize={onMove}
        />
      </div>
      <p className="mt-3 text-caption text-fg-subtle">
        Arraste para mudar o horário e puxe a borda para mudar a duração; tudo é salvo na hora. Num
        evento que se repete, arrastar move só aquela ocorrência. O LifeOS não envia lembretes nem
        notificações: confira o calendário.
      </p>

      <Dialog
        open={
          dialog !== null &&
          (dialog.mode === 'create' || viewItem !== undefined || editEvent !== undefined)
        }
        onClose={() => {
          setDialog(null);
        }}
        title={
          dialog?.mode === 'create'
            ? 'Novo evento'
            : dialog?.mode === 'edit'
              ? 'Editar evento'
              : dialog?.mode === 'split'
                ? 'Editar esta e as próximas ocorrências'
                : dialog?.mode === 'occurrence'
                  ? 'Editar só esta ocorrência'
                  : (viewItem?.title ?? '')
        }
        size="lg"
      >
        {dialog?.mode === 'create' && (
          <EventForm
            {...(dialog.draft ? { draft: dialog.draft } : {})}
            timezone={timezone}
            subjects={subjects}
            tasks={tasks}
            habits={habits}
            categories={categories}
            onSaved={() => {
              setDialog(null);
            }}
            onCancel={() => {
              setDialog(null);
            }}
          />
        )}
        {dialog?.mode === 'split' && editEvent && (
          <EventForm
            event={editEvent}
            split={dialog.split}
            timezone={timezone}
            subjects={subjects}
            tasks={tasks}
            habits={habits}
            categories={categories}
            onSaved={() => {
              setDialog(null);
            }}
            onCancel={() => {
              setDialog(null);
            }}
          />
        )}
        {dialog?.mode === 'occurrence' && editEvent && viewItem?.occurrence && (
          <OccurrenceForm
            event={editEvent}
            occurrence={viewItem.occurrence}
            timezone={timezone}
            onSaved={() => {
              setDialog(null);
            }}
            onCancel={() => {
              setDialog(null);
            }}
          />
        )}
        {dialog?.mode === 'edit' && editEvent && (
          <EventForm
            event={editEvent}
            timezone={timezone}
            subjects={subjects}
            tasks={tasks}
            habits={habits}
            categories={categories}
            onSaved={() => {
              setDialog(null);
            }}
            onCancel={() => {
              setDialog(null);
            }}
          />
        )}
        {dialog?.mode === 'view' && viewItem && (
          <EventDetail
            item={viewItem}
            event={eventOf(viewItem)}
            activities={activities.data ?? []}
            tasks={tasks}
            subjects={subjects}
            habits={habits}
            categories={categories}
            conflictsWith={conflictPartners.get(viewItem.id) ?? []}
            timezone={timezone}
            onEdit={(eventId) => {
              setDialog({ mode: 'edit', eventId });
            }}
            onEditOccurrence={() => {
              setDialog({ mode: 'occurrence', itemId: viewItem.id });
            }}
            onEditFollowing={(split) => {
              if (viewItem.eventId) setDialog({ mode: 'split', eventId: viewItem.eventId, split });
            }}
            onClose={() => {
              setDialog(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Dica dos botões ‹ › do calendário, com concordância de gênero ("Próxima semana"). */
function navHint(direction: 'prev' | 'next') {
  return (unit: string) => {
    const u = unit.toLowerCase();
    const feminine = u === 'semana';
    if (direction === 'prev')
      return `${feminine ? 'Semana' : u === 'mês' ? 'Mês' : 'Dia'} anterior`;
    return `${feminine ? 'Próxima' : 'Próximo'} ${u}`;
  };
}

/**
 * Os ícones das setas do FullCalendar são <span role="img"> sem texto alternativo; o botão já tem
 * nome (aria-label vindo de buttonHints), então o ícone é decorativo. O FullCalendar recria a
 * barra ao trocar de visão — por isso a correção acompanha as mudanças do DOM.
 */
function useDecorativeCalendarIcons(box: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const fix = () => {
      for (const icon of root.querySelectorAll('.fc-icon[role="img"]')) {
        icon.removeAttribute('role');
        icon.setAttribute('aria-hidden', 'true');
      }
    };
    fix();
    const observer = new MutationObserver(fix);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [box]);
}
