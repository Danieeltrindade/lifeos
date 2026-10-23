import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { inputValue } from '@/lib/forms';
import type { Project } from '@/services/data/queries';
import { PRIORITY_LABELS } from '@/modules/tasks/logic/tasks';
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '../logic/projects';
import { useCreateProject, useUpdateProject } from '../data/project-api';
import { projectFormSchema, type ProjectFormInput } from '../schemas';
import { useDraftId } from '@/lib/query/draft-id';

export function ProjectForm({
  project,
  onSaved,
  onCancel,
}: {
  project?: Project;
  onSaved: (project: Project) => void;
  onCancel: () => void;
}) {
  const create = useCreateProject();
  const [draftId, renewDraftId] = useDraftId();
  const update = useUpdateProject();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormInput, unknown, ReturnType<typeof projectFormSchema.parse>>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: (project?.status ?? 'active') as ProjectStatus,
      priority: (project?.priority ?? 'medium') as 'low' | 'medium' | 'high',
      startOn: inputValue(project?.start_on),
      dueOn: inputValue(project?.due_on),
      notes: project?.notes ?? '',
    },
  });
  const pending = isSubmitting || create.isPending || update.isPending;

  const onSubmit = handleSubmit(async (v) => {
    const row = {
      name: v.name,
      description: v.description,
      status: v.status,
      priority: v.priority,
      start_on: v.startOn,
      due_on: v.dueOn,
      notes: v.notes,
    };
    try {
      onSaved(
        project
          ? await update.mutateAsync({ id: project.id, patch: row })
          : await create.mutateAsync({ ...row, id: draftId }),
      );
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // Erro já exibido; o formulário continua aberto.
    }
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="flex flex-col gap-4"
      aria-label="Projeto"
    >
      <TextField
        label="Nome"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextareaField
        label="Descrição"
        hint="O resultado que o projeto deve entregar."
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Status" {...register('status')}>
          {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Prioridade" {...register('priority')}>
          {(['high', 'medium', 'low'] as const).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Início"
          type="date"
          error={errors.startOn?.message}
          {...register('startOn')}
        />
        <TextField label="Prazo" type="date" error={errors.dueOn?.message} {...register('dueOn')} />
      </div>
      <TextareaField label="Observações" error={errors.notes?.message} {...register('notes')} />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : project ? 'Salvar alterações' : 'Criar projeto'}
        </Button>
      </div>
    </form>
  );
}
