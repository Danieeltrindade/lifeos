import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { addDays, type ISODate } from '@/lib/date';
import { optionalText, requiredText } from '@/lib/forms';
import { fromLocalInput, toLocalInput, weekdayOf } from '@/lib/zoned';
import type { Subject, Task } from '@/services/data/queries';
import type { Habit } from '@/modules/habits/data/habit-api';
import {
  describeRule,
  formatRule,
  parseRule,
  type Frequency,
  type RecurrenceRule,
} from '../logic/recurrence';
import { KIND_LABELS, type CalendarEvent } from '../logic/calendar-items';
import { useEventMutations, useSplitSeries, type EventInput } from '../data/calendar-api';
import type { Category } from '@/services/data/queries';
import { useDraftId } from '@/lib/query/draft-id';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const schema = z.object({
  title: requiredText(200, 'o título'),
  description: optionalText(4000),
  kind: z.enum(['event', 'study', 'task', 'habit']),
  allDay: z.boolean(),
  start: z.string().min(1, { error: 'Informe o início.' }),
  end: z.string().min(1, { error: 'Informe o fim.' }),
  startDate: z.string(),
  endDate: z.string(),
  freq: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  interval: z.string(),
  weekdays: z.array(z.string()),
  monthlyNth: z.boolean(),
  endMode: z.enum(['never', 'count', 'until']),
  count: z.string(),
  until: z.string(),
  subjectId: z.string(),
  taskId: z.string(),
  habitId: z.string(),
  categoryId: z.string(),
});

type Input = z.input<typeof schema>;

/** Edição de "esta e as seguintes": a série é dividida na ocorrência escolhida. */
export interface SplitEdit {
  /** Chave da ocorrência (início original: instante ou data). */
  occurrenceKey: string;
  oldRule: string;
  newRule: string;
}

export interface EventDraft {
  allDay: boolean;
  /** Instantes (com horário) ou datas (dia inteiro, fim exclusivo). */
  start: string;
  end: string;
}

function nthOfMonth(date: ISODate): number {
  const day = Number(date.slice(8, 10));
  const nth = Math.ceil(day / 7);
  const lastWeek = Number(addDays(date, 7).slice(5, 7)) !== Number(date.slice(5, 7));
  return lastWeek && nth >= 4 ? -1 : Math.min(nth, 4);
}

/**
 * Formulário de evento/bloco. Recorrência gera uma REGRA (nunca cópias); a interface a expande
 * só na janela visível. Blocos de estudo/tarefa guardam o vínculo para comparar planejado
 * e realizado — criar um bloco NÃO conclui a tarefa.
 */
export function EventForm({
  event,
  draft,
  timezone,
  subjects,
  tasks,
  habits,
  categories = [],
  split,
  onSaved,
  onCancel,
}: {
  event?: CalendarEvent;
  draft?: EventDraft;
  split?: SplitEdit;
  timezone: string;
  subjects: readonly Subject[];
  tasks: readonly Task[];
  habits: readonly Habit[];
  categories?: readonly Category[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { create, update } = useEventMutations();
  const [draftId, renewDraftId] = useDraftId();
  const splitSeries = useSplitSeries();
  const rule = parseRule(split ? split.newRule : event?.recurrence_rule);
  const allDay = event?.all_day ?? draft?.allDay ?? false;
  const now = new Date();
  // Na divisão, a nova série começa na ocorrência escolhida, com a mesma duração.
  const seriesDuration =
    event?.starts_at && event.ends_at
      ? Date.parse(event.ends_at) - Date.parse(event.starts_at)
      : 3600_000;
  const splitStart = split && !allDay ? new Date(split.occurrenceKey).toISOString() : null;
  const defaultStart =
    splitStart ?? event?.starts_at ?? (draft && !draft.allDay ? draft.start : now.toISOString());
  const defaultEnd = splitStart
    ? new Date(Date.parse(splitStart) + seriesDuration).toISOString()
    : (event?.ends_at ??
      (draft && !draft.allDay ? draft.end : new Date(now.getTime() + 3600_000).toISOString()));
  const allDayLength =
    event?.start_date && event.end_date
      ? Math.round((Date.parse(event.end_date) - Date.parse(event.start_date)) / 86_400_000)
      : 1;
  const splitDate = split && allDay ? split.occurrenceKey.slice(0, 10) : null;
  const startDate =
    splitDate ??
    event?.start_date ??
    (draft?.allDay ? draft.start : toLocalInput(defaultStart, timezone).slice(0, 10));
  const endDateExclusive = splitDate
    ? addDays(splitDate, allDayLength)
    : (event?.end_date ?? (draft?.allDay ? draft.end : addDays(startDate, 1)));
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: event?.title ?? '',
      description: event?.description ?? '',
      kind: (event?.kind ?? 'event') as 'event' | 'study' | 'task' | 'habit',
      allDay,
      start: toLocalInput(defaultStart, timezone),
      end: toLocalInput(defaultEnd, timezone),
      startDate,
      endDate: addDays(endDateExclusive, -1),
      freq: rule?.freq ?? 'NONE',
      interval: String(rule?.interval ?? 1),
      weekdays: (rule?.byWeekday.length ? rule.byWeekday : [weekdayOf(startDate)]).map(String),
      monthlyNth: rule?.byMonthWeekday !== null && rule?.byMonthWeekday !== undefined,
      endMode: rule?.count ? 'count' : rule?.until ? 'until' : 'never',
      count: String(rule?.count ?? 10),
      until: rule?.until ?? addDays(startDate, 90),
      subjectId: event?.subject_id ?? '',
      taskId: event?.task_id ?? '',
      habitId: event?.habit_id ?? '',
      categoryId: event?.category_id ?? '',
    },
  });
  const v = useWatch({ control });
  const pending = isSubmitting || create.isPending || update.isPending || splitSeries.isPending;

  const buildRule = (
    values: z.output<typeof schema>,
    firstDate: ISODate,
  ): RecurrenceRule | null => {
    if (values.freq === 'NONE') return null;
    const interval = Math.min(365, Math.max(1, Number(values.interval) || 1));
    const freq: Frequency = values.freq;
    return {
      freq,
      interval,
      byWeekday: freq === 'WEEKLY' ? values.weekdays.map(Number).sort((a, b) => a - b) : [],
      byMonthWeekday:
        freq === 'MONTHLY' && values.monthlyNth
          ? { weekday: weekdayOf(firstDate), nth: nthOfMonth(firstDate) }
          : null,
      count:
        values.endMode === 'count' ? Math.min(1000, Math.max(1, Number(values.count) || 1)) : null,
      until: values.endMode === 'until' && values.until ? values.until : null,
    };
  };

  const onSubmit = handleSubmit(async (values) => {
    let row: EventInput;
    let firstDate: ISODate;
    if (values.allDay) {
      if (!values.startDate || !values.endDate || values.endDate < values.startDate) {
        setError('endDate', { message: 'O último dia não pode ser antes do primeiro.' });
        return;
      }
      firstDate = values.startDate;
      row = {
        title: values.title,
        description: values.description,
        kind: values.kind,
        all_day: true,
        starts_at: null,
        ends_at: null,
        start_date: values.startDate,
        end_date: addDays(values.endDate, 1),
        timezone,
      };
    } else {
      const startsAt = fromLocalInput(values.start, timezone);
      const endsAt = fromLocalInput(values.end, timezone);
      if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
        setError('end', { message: 'O fim precisa ser depois do início.' });
        return;
      }
      firstDate = toLocalInput(startsAt, timezone).slice(0, 10);
      row = {
        title: values.title,
        description: values.description,
        kind: values.kind,
        all_day: false,
        starts_at: startsAt,
        ends_at: endsAt,
        start_date: null,
        end_date: null,
        timezone,
      };
    }
    if (values.freq === 'WEEKLY' && values.weekdays.length === 0) {
      setError('weekdays', { message: 'Escolha pelo menos um dia.' });
      return;
    }
    const recurrence = buildRule(values, firstDate);
    if (recurrence?.until && recurrence.until < firstDate) {
      setError('until', { message: 'A data final precisa ser depois do início.' });
      return;
    }
    row.recurrence_rule = recurrence ? formatRule(recurrence) : null;
    row.subject_id = values.kind === 'study' ? values.subjectId || null : null;
    row.task_id = values.kind === 'task' ? values.taskId || null : null;
    row.habit_id = values.kind === 'habit' ? values.habitId || null : null;
    row.category_id = values.categoryId || null;
    try {
      if (event && split) {
        await splitSeries.mutateAsync({
          eventId: event.id,
          oldRule: split.oldRule,
          split: allDay ? { date: split.occurrenceKey } : { instant: split.occurrenceKey },
          newRow: row,
        });
      } else if (event) await update.mutateAsync({ id: event.id, patch: row });
      else await create.mutateAsync({ ...row, id: draftId });
      onSaved();
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // Erro exibido no aviso.
    }
  });

  const previewDate = v.allDay ? (v.startDate ?? '') : (v.start ?? '').slice(0, 10);
  const preview =
    v.freq && v.freq !== 'NONE' && previewDate
      ? describeRule({
          freq: v.freq,
          interval: Math.max(1, Number(v.interval) || 1),
          byWeekday:
            v.freq === 'WEEKLY' ? (v.weekdays ?? []).map(Number).sort((a, b) => a - b) : [],
          byMonthWeekday:
            v.freq === 'MONTHLY' && v.monthlyNth
              ? { weekday: weekdayOf(previewDate), nth: nthOfMonth(previewDate) }
              : null,
          count: v.endMode === 'count' ? Math.max(1, Number(v.count) || 1) : null,
          until: v.endMode === 'until' ? (v.until ?? null) : null,
        })
      : null;

  return (
    <form
      noValidate
      aria-label="Evento"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Título"
          autoComplete="off"
          error={errors.title?.message}
          {...register('title')}
        />
        <SelectField label="Tipo" {...register('kind')}>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      {split && (
        <p className="rounded-md bg-surface-muted p-3 text-body-sm text-fg-muted">
          As alterações valem a partir desta ocorrência. As anteriores continuam como estavam.
        </p>
      )}
      <CheckboxField label="Dia inteiro" disabled={Boolean(split)} {...register('allDay')} />
      {v.allDay ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Primeiro dia"
            type="date"
            error={errors.startDate?.message}
            {...register('startDate')}
          />
          <TextField
            label="Último dia"
            type="date"
            error={errors.endDate?.message}
            {...register('endDate')}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Início"
            type="datetime-local"
            error={errors.start?.message}
            {...register('start')}
          />
          <TextField
            label="Fim"
            type="datetime-local"
            hint={`Fuso ${timezone}. Pode passar da meia-noite.`}
            error={errors.end?.message}
            {...register('end')}
          />
        </div>
      )}

      {v.kind === 'study' && (
        <SelectField
          label="Matéria"
          hint="Para comparar planejado e realizado."
          {...register('subjectId')}
        >
          <option value="">Sem matéria</option>
          {subjects
            .filter((s) => s.archived_at === null || s.id === event?.subject_id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </SelectField>
      )}
      {v.kind === 'task' && (
        <SelectField
          label="Tarefa"
          hint="O bloco não conclui a tarefa; ele só reserva tempo."
          {...register('taskId')}
        >
          <option value="">Sem tarefa</option>
          {tasks
            .filter(
              (t) => t.status === 'todo' || t.status === 'in_progress' || t.id === event?.task_id,
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </SelectField>
      )}
      {v.kind === 'habit' && (
        <SelectField label="Hábito" {...register('habitId')}>
          <option value="">Sem hábito</option>
          {habits
            .filter((h) => h.archived_at === null || h.id === event?.habit_id)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
        </SelectField>
      )}

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-body-sm font-medium">Repetição</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Repetir" {...register('freq')}>
            <option value="NONE">Não repete</option>
            <option value="DAILY">Diariamente</option>
            <option value="WEEKLY">Semanalmente</option>
            <option value="MONTHLY">Mensalmente</option>
            <option value="YEARLY">Anualmente</option>
          </SelectField>
          {v.freq !== 'NONE' && (
            <TextField label="A cada (intervalo)" inputMode="numeric" {...register('interval')} />
          )}
        </div>
        {v.freq === 'WEEKLY' && (
          <div>
            <p className="mb-1.5 text-body-sm font-medium">Dias</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((label, i) => (
                <label
                  key={label}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border-strong px-3 text-body-sm"
                >
                  <input
                    type="checkbox"
                    value={String(i)}
                    className="accent-[var(--lo-primary)]"
                    {...register('weekdays')}
                  />
                  {label}
                </label>
              ))}
            </div>
            {errors.weekdays?.message && (
              <p className="mt-1 text-caption font-medium text-danger">{errors.weekdays.message}</p>
            )}
          </div>
        )}
        {v.freq === 'MONTHLY' && (
          <CheckboxField
            label="No mesmo dia da semana do mês (ex.: 2ª terça) em vez do mesmo dia do mês"
            {...register('monthlyNth')}
          />
        )}
        {v.freq !== 'NONE' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Termina" {...register('endMode')}>
              <option value="never">Nunca</option>
              <option value="count">Após N vezes</option>
              <option value="until">Em uma data</option>
            </SelectField>
            {v.endMode === 'count' && (
              <TextField label="Vezes" inputMode="numeric" {...register('count')} />
            )}
            {v.endMode === 'until' && (
              <TextField
                label="Até"
                type="date"
                error={errors.until?.message}
                {...register('until')}
              />
            )}
          </div>
        )}
        {preview && <p className="text-caption text-fg-subtle">{preview}.</p>}
      </fieldset>

      <SelectField
        label="Categoria"
        hint="Define a cor do item no calendário e permite filtrar."
        {...register('categoryId')}
      >
        <option value="">Sem categoria</option>
        {categories
          .filter((c) => c.archived_at === null || c.id === event?.category_id)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </SelectField>

      <TextareaField
        label="Descrição"
        rows={2}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Salvando…'
            : split
              ? 'Salvar esta e as próximas'
              : event
                ? 'Salvar evento'
                : 'Criar evento'}
        </Button>
      </div>
    </form>
  );
}
