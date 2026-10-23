import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { inputValue, optionalInt, optionalNumber, optionalText, requiredText } from '@/lib/forms';
import { fromLocalInput, toLocalInput } from '@/lib/zoned';
import type { Category, Project, Subject, Task, Topic } from '@/services/data/queries';
import { topicOptions } from '@/modules/studies/logic/topic-options';
import { useSaveActivity } from '../data/activity-api';
import {
  INTENSITY_LABELS,
  KIND_LABELS,
  type Activity,
  type ActivityKind,
} from '../logic/activities';
import { useDraftId } from '@/lib/query/draft-id';

const schema = z.object({
  kind: z.enum(['study', 'reading', 'exercise', 'project', 'work', 'leisure', 'other']),
  title: requiredText(200, 'o título'),
  start: z.string().min(1, { error: 'Informe o início.' }),
  end: z.string().min(1, { error: 'Informe o fim.' }),
  categoryId: z.string(),
  subjectId: z.string(),
  topicId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
  pages: optionalInt(0, 10000, 'número de páginas'),
  readingTitle: optionalText(200),
  distanceKm: optionalNumber(0, 1000, 'distância'),
  intensity: optionalInt(1, 5, 'nível'),
  notes: optionalText(4000),
});

type Input = z.input<typeof schema>;

/**
 * Formulário por TIPO: estudo pede matéria/tópico; leitura, páginas e obra; exercício,
 * distância e intensidade; projeto, projeto ou tarefa. Campos de outros tipos são limpos
 * ao salvar (o banco também recusa métricas fora do tipo).
 */
export function ActivityForm({
  activity,
  timezone,
  categories,
  subjects,
  topics,
  projects,
  tasks,
  onSaved,
  onCancel,
}: {
  activity?: Activity;
  timezone: string;
  categories: readonly Category[];
  subjects: readonly Subject[];
  topics: readonly Topic[];
  projects: readonly Project[];
  tasks: readonly Task[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const save = useSaveActivity();
  const [draftId, renewDraftId] = useDraftId();
  const timer = activity?.source === 'timer';
  const [now] = useState(() => new Date());
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: (activity?.kind ?? 'other') as ActivityKind,
      title: activity?.title ?? '',
      start: toLocalInput(
        activity?.started_at ?? new Date(now.getTime() - 3600_000).toISOString(),
        timezone,
      ),
      end: toLocalInput(activity?.ended_at ?? now.toISOString(), timezone),
      categoryId: inputValue(activity?.category_id),
      subjectId: inputValue(activity?.subject_id),
      topicId: inputValue(activity?.topic_id),
      projectId: inputValue(activity?.project_id),
      taskId: inputValue(activity?.task_id),
      pages: inputValue(activity?.pages),
      readingTitle: activity?.reading_title ?? '',
      distanceKm: inputValue(activity?.distance_km),
      intensity: inputValue(activity?.intensity),
      notes: activity?.notes ?? '',
    },
  });
  const kind = useWatch({ control, name: 'kind' });
  const subjectId = useWatch({ control, name: 'subjectId' });
  const pending = isSubmitting || save.isPending;

  const onSubmit = handleSubmit(async (v) => {
    const startedAt = fromLocalInput(v.start, timezone);
    const endedAt = fromLocalInput(v.end, timezone);
    if (!timer) {
      if (!startedAt || !endedAt || Date.parse(endedAt) <= Date.parse(startedAt)) {
        setError('end', { message: 'O fim precisa ser depois do início.' });
        return;
      }
    }
    const study = v.kind === 'study';
    const reading = v.kind === 'reading';
    const exercise = v.kind === 'exercise';
    const row = {
      kind: timer ? 'study' : v.kind,
      title: v.title,
      started_at: startedAt ?? activity?.started_at ?? '',
      ended_at: endedAt ?? activity?.ended_at ?? '',
      category_id: v.categoryId || null,
      subject_id: study ? v.subjectId || null : null,
      topic_id: study && v.subjectId ? v.topicId || null : null,
      task_id: v.taskId || null,
      project_id: v.taskId ? null : v.projectId || null,
      pages: reading ? v.pages : null,
      reading_title: reading ? v.readingTitle || null : null,
      distance_km: exercise ? v.distanceKm : null,
      intensity: exercise ? v.intensity : null,
      notes: v.notes,
    };
    try {
      await save.mutateAsync(
        activity ? { id: activity.id, row } : { row: { ...row, id: draftId } },
      );
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
      aria-label="Atividade"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      {timer && (
        <Notice tone="info">
          Gerada pelo cronômetro: horários e duração vêm da sessão (corrija pela tela do
          cronômetro). Aqui dá para ajustar título, categoria, vínculos e anotações.
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Tipo" disabled={timer} {...register('kind')}>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Título"
          autoComplete="off"
          error={errors.title?.message}
          {...register('title')}
        />
        <TextField
          label="Início"
          type="datetime-local"
          disabled={timer}
          error={errors.start?.message}
          {...register('start')}
        />
        <TextField
          label="Fim"
          type="datetime-local"
          disabled={timer}
          hint={`Fuso ${timezone}. Pode passar da meia-noite.`}
          error={errors.end?.message}
          {...register('end')}
        />
      </div>

      {kind === 'study' && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Estudo</legend>
          <SelectField label="Matéria" {...register('subjectId')}>
            <option value="">Sem matéria</option>
            {subjects
              .filter((s) => s.archived_at === null || s.id === activity?.subject_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </SelectField>
          <SelectField label="Tópico" disabled={!subjectId} {...register('topicId')}>
            <option value="">Sem tópico</option>
            {subjectId &&
              topicOptions(topics, subjectId).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </SelectField>
        </fieldset>
      )}
      {kind === 'reading' && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Leitura</legend>
          <TextField
            label="Obra"
            placeholder="Livro, artigo…"
            error={errors.readingTitle?.message}
            {...register('readingTitle')}
          />
          <TextField
            label="Páginas lidas"
            inputMode="numeric"
            error={errors.pages?.message}
            {...register('pages')}
          />
        </fieldset>
      )}
      {kind === 'exercise' && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Exercício</legend>
          <TextField
            label="Distância (km)"
            inputMode="decimal"
            error={errors.distanceKm?.message}
            {...register('distanceKm')}
          />
          <SelectField
            label="Intensidade"
            error={errors.intensity?.message}
            {...register('intensity')}
          >
            <option value="">Não informada</option>
            {[1, 2, 3, 4, 5].map((i) => (
              <option key={i} value={String(i)}>
                {i} · {INTENSITY_LABELS[i]}
              </option>
            ))}
          </SelectField>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Categoria" {...register('categoryId')}>
          <option value="">Sem categoria</option>
          {categories
            .filter((c) => c.archived_at === null || c.id === activity?.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Projeto"
          hint="Com tarefa, vale o projeto dela."
          {...register('projectId')}
        >
          <option value="">Nenhum</option>
          {projects
            .filter((p) => p.archived_at === null || p.id === activity?.project_id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </SelectField>
        <SelectField label="Tarefa" {...register('taskId')}>
          <option value="">Nenhuma</option>
          {tasks
            .filter((t) => t.status !== 'cancelled' || t.id === activity?.task_id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </SelectField>
      </div>
      <TextareaField
        label="Anotações"
        rows={2}
        error={errors.notes?.message}
        {...register('notes')}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : activity ? 'Salvar atividade' : 'Registrar atividade'}
        </Button>
      </div>
    </form>
  );
}
