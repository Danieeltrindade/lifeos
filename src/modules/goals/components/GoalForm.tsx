import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { inputValue, optionalDate, optionalNumber, optionalText, requiredText } from '@/lib/forms';
import type { Category, Project, Subject } from '@/services/data/queries';
import type { Habit } from '@/modules/habits/data/habit-api';
import { KIND_LABELS } from '@/modules/activities/logic/activities';
import {
  MODE_LABELS,
  PERIOD_LABELS,
  type Goal,
  type GoalMode,
  type GoalPeriod,
} from '../logic/goals';
import { useSaveGoal } from '../data/goal-api';
import { useDraftId } from '@/lib/query/draft-id';

const MODES = Object.keys(MODE_LABELS) as GoalMode[];

const schema = z
  .object({
    title: requiredText(200, 'o título'),
    description: optionalText(2000),
    mode: z.enum([
      'manual',
      'activity_time',
      'study_sessions',
      'questions',
      'pages',
      'tasks_completed',
      'habit_checkins',
    ]),
    period: z.enum(['once', 'daily', 'weekly', 'monthly']),
    target: optionalNumber(0.01, 1_000_000_000, 'alvo'),
    unit: optionalText(30),
    startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Informe o início.' }),
    dueOn: optionalDate,
    // Fonte: "tipo:id" (subject, category, project, kind) ou vazio.
    source: z.string(),
    habitId: z.string(),
    linkedOnly: z.boolean(),
  })
  .refine((v) => v.target !== null, { error: 'Informe o alvo.', path: ['target'] })
  .refine((v) => v.mode !== 'manual' || v.unit !== '', {
    error: 'Informe a unidade (ex.: livros).',
    path: ['unit'],
  })
  .refine((v) => v.mode !== 'habit_checkins' || v.habitId !== '', {
    error: 'Escolha o hábito.',
    path: ['habitId'],
  })
  .refine((v) => !v.dueOn || v.dueOn >= v.startOn, {
    error: 'O prazo não pode ser antes do início.',
    path: ['dueOn'],
  });

type Input = z.input<typeof schema>;

function sourceOf(goal: Goal | undefined): string {
  if (!goal) return '';
  if (goal.subject_id) return `subject:${goal.subject_id}`;
  if (goal.activity_category_id) return `category:${goal.activity_category_id}`;
  if (goal.project_id) return `project:${goal.project_id}`;
  if (goal.activity_kind) return `kind:${goal.activity_kind}`;
  return '';
}

/** Fontes permitidas por tipo de meta (mesma regra da constraint goals_sources_match_mode). */
function allowedSources(mode: GoalMode): ('subject' | 'category' | 'project' | 'kind')[] {
  switch (mode) {
    case 'activity_time':
      return ['subject', 'category', 'project', 'kind'];
    case 'study_sessions':
    case 'questions':
      return ['subject'];
    case 'tasks_completed':
      return ['project'];
    default:
      return [];
  }
}

export function GoalForm({
  goal,
  today,
  subjects,
  categories,
  projects,
  habits,
  onSaved,
  onCancel,
}: {
  goal?: Goal;
  today: string;
  subjects: readonly Subject[];
  categories: readonly Category[];
  projects: readonly Project[];
  habits: readonly Habit[];
  onSaved: (goal: Goal) => void;
  onCancel: () => void;
}) {
  const save = useSaveGoal();
  const [draftId, renewDraftId] = useDraftId();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: goal?.title ?? '',
      description: goal?.description ?? '',
      mode: (goal?.progress_mode ?? 'activity_time') as GoalMode,
      period: (goal?.period ?? 'weekly') as GoalPeriod,
      target: inputValue(goal?.target_value),
      unit: goal?.progress_mode === 'manual' ? goal.unit : '',
      startOn: goal?.start_on ?? today,
      dueOn: inputValue(goal?.due_on),
      source: sourceOf(goal),
      habitId: inputValue(goal?.habit_id),
      linkedOnly: goal?.linked_tasks_only ?? false,
    },
  });
  const mode = useWatch({ control, name: 'mode' });
  const allowed = allowedSources(mode);
  const unitHint = MODE_LABELS[mode].unit;
  const pending = isSubmitting || save.isPending;

  const onSubmit = handleSubmit(async (v) => {
    const [kind, id] = v.source.split(':');
    const usable = kind && id && (allowed as string[]).includes(kind);
    const row = {
      title: v.title,
      description: v.description,
      progress_mode: v.mode,
      period: v.period,
      target_value: v.target ?? 1,
      // Tipos derivados recebem a unidade canônica no banco; enviamos a mesma.
      unit: v.mode === 'manual' ? v.unit : (MODE_LABELS[v.mode].unit ?? 'un'),
      start_on: v.startOn,
      due_on: v.dueOn,
      subject_id: usable && kind === 'subject' ? id : null,
      activity_category_id: usable && kind === 'category' ? id : null,
      project_id: usable && kind === 'project' ? id : null,
      activity_kind: usable && kind === 'kind' ? id : null,
      habit_id: v.mode === 'habit_checkins' ? v.habitId : null,
      linked_tasks_only: v.mode === 'tasks_completed' && v.linkedOnly,
    };
    try {
      onSaved(
        await save.mutateAsync(goal ? { id: goal.id, row } : { row: { ...row, id: draftId } }),
      );
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // Erro exibido no aviso.
    }
  });

  return (
    <form
      noValidate
      aria-label="Meta"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      <TextField
        label="Título"
        autoComplete="off"
        error={errors.title?.message}
        {...register('title')}
      />
      {mode === 'tasks_completed' && (
        <CheckboxField
          label="Contar só tarefas vinculadas a esta meta"
          hint="Vincule tarefas no formulário da tarefa (campo “Meta”)."
          {...register('linkedOnly')}
        />
      )}
      <TextareaField
        label="Descrição"
        rows={2}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Tipo" hint={MODE_LABELS[mode].source} {...register('mode')}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m].label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Ciclo"
          hint="Ciclos seguem o seu fuso e o início da semana do perfil."
          {...register('period')}
        >
          {(Object.keys(PERIOD_LABELS) as GoalPeriod[]).map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField
          label={`Alvo${unitHint ? ` (${unitHint})` : ''}`}
          inputMode="decimal"
          error={errors.target?.message}
          {...register('target')}
        />
        {mode === 'manual' ? (
          <TextField
            label="Unidade"
            placeholder="livros, km, R$…"
            error={errors.unit?.message}
            {...register('unit')}
          />
        ) : mode === 'habit_checkins' ? (
          <SelectField label="Hábito" error={errors.habitId?.message} {...register('habitId')}>
            <option value="">Escolha…</option>
            {habits
              .filter((h) => h.archived_at === null || h.id === goal?.habit_id)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
          </SelectField>
        ) : allowed.length > 0 ? (
          <SelectField
            label="Contar só"
            hint="Opcional: restringe a fonte."
            {...register('source')}
          >
            <option value="">Tudo</option>
            {allowed.includes('subject') && (
              <optgroup label="Matéria">
                {subjects.map((s) => (
                  <option key={s.id} value={`subject:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {allowed.includes('kind') && (
              <optgroup label="Tipo de atividade">
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={`kind:${value}`}>
                    {label}
                  </option>
                ))}
              </optgroup>
            )}
            {allowed.includes('category') && categories.length > 0 && (
              <optgroup label="Categoria">
                {categories.map((c) => (
                  <option key={c.id} value={`category:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {allowed.includes('project') && projects.length > 0 && (
              <optgroup label="Projeto">
                {projects.map((p) => (
                  <option key={p.id} value={`project:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </SelectField>
        ) : (
          <div />
        )}
        <TextField
          label="Início"
          type="date"
          error={errors.startOn?.message}
          {...register('startOn')}
        />
        <TextField label="Prazo" type="date" error={errors.dueOn?.message} {...register('dueOn')} />
      </div>
      {mode === 'manual' ? (
        <Notice tone="warning">
          Meta MANUAL: o progresso é a soma dos lançamentos que você registra (com data). Ela é
          sempre sinalizada como manual.
        </Notice>
      ) : (
        <Notice tone="info">
          O progresso é calculado automaticamente a partir dos seus registros. Editar a meta depois
          não reescreve o histórico; a mudança fica registrada.
        </Notice>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : goal ? 'Salvar meta' : 'Criar meta'}
        </Button>
      </div>
    </form>
  );
}
