import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { inputValue, optionalNumber, optionalText, requiredText } from '@/lib/forms';
import { useSaveHabit, type Habit } from '../data/habit-api';
import { useDraftId } from '@/lib/query/draft-id';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const schema = z
  .object({
    name: requiredText(120, 'o nome'),
    description: optionalText(2000),
    scheduleKind: z.enum(['daily', 'weekdays', 'times_per_week']),
    weekdays: z.array(z.string()),
    timesPerWeek: z.string(),
    targetValue: optionalNumber(0.01, 99999999, 'valor'),
    unit: optionalText(30),
    startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Informe a data de início.' }),
  })
  .refine((v) => v.scheduleKind !== 'weekdays' || v.weekdays.length > 0, {
    error: 'Escolha pelo menos um dia.',
    path: ['weekdays'],
  })
  .refine((v) => (v.targetValue === null) === (v.unit === ''), {
    error: 'Meta por marcação e unidade andam juntas (ex.: 20 páginas).',
    path: ['unit'],
  });

export function HabitForm({
  habit,
  today,
  onSaved,
  onCancel,
}: {
  habit?: Habit;
  today: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const save = useSaveHabit();
  const [draftId, renewDraftId] = useDraftId();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: habit?.name ?? '',
      description: habit?.description ?? '',
      scheduleKind: (habit?.schedule_kind ?? 'daily') as 'daily' | 'weekdays' | 'times_per_week',
      weekdays: (habit?.weekdays ?? [1, 3, 5]).map(String),
      timesPerWeek: String(habit?.times_per_week ?? 3),
      targetValue: inputValue(habit?.target_value),
      unit: habit?.unit ?? '',
      startOn: habit?.start_on ?? today,
    },
  });
  const kind = useWatch({ control, name: 'scheduleKind' });
  const pending = isSubmitting || save.isPending;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        ...(habit ? { id: habit.id } : {}),
        row: {
          ...(habit ? {} : { id: draftId }),
          name: v.name,
          description: v.description,
          schedule_kind: v.scheduleKind,
          weekdays:
            v.scheduleKind === 'weekdays' ? v.weekdays.map(Number).sort((a, b) => a - b) : null,
          times_per_week: v.scheduleKind === 'times_per_week' ? Number(v.timesPerWeek) : null,
          target_value: v.targetValue,
          unit: v.unit || null,
          start_on: v.startOn,
        },
      });
      onSaved();
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // Erro exibido no aviso.
    }
  });

  return (
    <form
      noValidate
      aria-label="Hábito"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      <TextField
        label="Nome"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextareaField
        label="Descrição"
        rows={2}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Frequência" {...register('scheduleKind')}>
          <option value="daily">Todo dia</option>
          <option value="weekdays">Dias da semana específicos</option>
          <option value="times_per_week">Algumas vezes por semana</option>
        </SelectField>
        {kind === 'times_per_week' ? (
          <SelectField label="Vezes por semana" {...register('timesPerWeek')}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={String(n)}>
                {n}×
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField
            label="Início"
            type="date"
            error={errors.startOn?.message}
            {...register('startOn')}
          />
        )}
      </div>
      {kind === 'weekdays' && (
        <fieldset>
          <legend className="mb-1.5 text-body-sm font-medium">Dias</legend>
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
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {kind === 'times_per_week' && (
          <TextField
            label="Início"
            type="date"
            error={errors.startOn?.message}
            {...register('startOn')}
          />
        )}
        <TextField
          label="Meta por marcação"
          inputMode="decimal"
          hint="Opcional. Ex.: 20 (páginas)."
          error={errors.targetValue?.message}
          {...register('targetValue')}
        />
        <TextField
          label="Unidade"
          placeholder="páginas, min…"
          error={errors.unit?.message}
          {...register('unit')}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : habit ? 'Salvar hábito' : 'Criar hábito'}
        </Button>
      </div>
    </form>
  );
}
