import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { inputValue, optionalInt, optionalText, requiredText } from '@/lib/forms';
import type { Subject } from '@/services/data/queries';
import { SUBJECT_COLORS, SUBJECT_STATUS_LABELS } from '../logic/subjects';
import { useSaveSubject } from '../data/studies-api';
import { useDraftId } from '@/lib/query/draft-id';

const schema = z.object({
  name: requiredText(120, 'o nome'),
  description: optionalText(2000),
  objective: optionalText(500),
  color: z.string(),
  term: optionalText(40),
  targetHours: optionalInt(1, 168, 'número de horas'),
  status: z.enum(['active', 'paused', 'completed']),
});

export function SubjectForm({
  subject,
  onSaved,
  onCancel,
}: {
  subject?: Subject;
  onSaved: (subject: Subject) => void;
  onCancel: () => void;
}) {
  const save = useSaveSubject();
  const [draftId, renewDraftId] = useDraftId();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: subject?.name ?? '',
      description: subject?.description ?? '',
      objective: subject?.objective ?? '',
      color: subject?.color ?? SUBJECT_COLORS[0] ?? '#2b8070',
      term: subject?.term ?? '',
      targetHours:
        subject?.target_minutes_per_week != null
          ? inputValue(Math.round(subject.target_minutes_per_week / 60))
          : '',
      status: (subject?.status ?? 'active') as 'active' | 'paused' | 'completed',
    },
  });
  const color = useWatch({ control, name: 'color' });
  const pending = isSubmitting || save.isPending;

  const onSubmit = handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync({
        ...(subject ? { id: subject.id } : {}),
        row: {
          ...(subject ? {} : { id: draftId }),
          name: v.name,
          description: v.description,
          objective: v.objective,
          color: v.color,
          term: v.term || null,
          target_minutes_per_week: v.targetHours === null ? null : v.targetHours * 60,
          status: v.status,
        },
      });
      onSaved(saved);
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // Erro exibido no aviso; formulário continua aberto.
    }
  });

  return (
    <form
      noValidate
      aria-label="Matéria"
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
      <TextField
        label="Objetivo"
        hint="Ex.: passar na prova final, dominar integrais."
        error={errors.objective?.message}
        {...register('objective')}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Carga pretendida (h/semana)"
          inputMode="numeric"
          hint="Planejamento, comparado ao tempo real."
          error={errors.targetHours?.message}
          {...register('targetHours')}
        />
        <TextField
          label="Período"
          placeholder="2026.2"
          error={errors.term?.message}
          {...register('term')}
        />
        <SelectField label="Status" {...register('status')}>
          {Object.entries(SUBJECT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-body-sm font-medium">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((c) => (
            <label key={c} className="relative">
              <input
                type="radio"
                className="peer sr-only"
                value={c}
                checked={color === c}
                onChange={() => {
                  setValue('color', c);
                }}
              />
              <span className="sr-only">Cor {c}</span>
              <span
                aria-hidden="true"
                className="block size-9 rounded-full border-2 border-transparent ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
                style={{ backgroundColor: c }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : subject ? 'Salvar alterações' : 'Criar matéria'}
        </Button>
      </div>
    </form>
  );
}
