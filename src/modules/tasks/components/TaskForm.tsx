import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { inputValue } from '@/lib/forms';
import { useGoalsQuery, type Category, type Project, type Task } from '@/services/data/queries';
import { PRIORITY_LABELS } from '../logic/tasks';
import { useCreateTask, useUpdateTask } from '../data/task-mutations';
import { taskFormSchema, type TaskFormInput } from '../schemas';
import { useDraftId } from '@/lib/query/draft-id';

export interface TaskFormDefaults {
  projectId?: string | null;
  parentTaskId?: string | null;
  dueOn?: string | null;
}

/**
 * Formulário de criação/edição de tarefa. O status NÃO é editado aqui: concluir, cancelar e
 * reabrir são ações explícitas (com as regras de dependência e subtarefas).
 */
export function TaskForm({
  task,
  defaults,
  tasks,
  projects,
  categories,
  onSaved,
  onCancel,
}: {
  task?: Task;
  defaults?: TaskFormDefaults;
  tasks: readonly Task[];
  projects: readonly Project[];
  categories: readonly Category[];
  onSaved: (task: Task) => void;
  onCancel: () => void;
}) {
  const goals = (useGoalsQuery().data ?? []).filter(
    (g) => (g.archived_at === null && g.status === 'active') || g.id === task?.goal_id,
  );
  const create = useCreateTask();
  const [draftId, renewDraftId] = useDraftId();
  const update = useUpdateTask();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormInput, unknown, ReturnType<typeof taskFormSchema.parse>>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      priority: (task?.priority ?? 'medium') as 'low' | 'medium' | 'high',
      startOn: inputValue(task?.start_on),
      dueOn: inputValue(task?.due_on ?? defaults?.dueOn),
      estimateMinutes: inputValue(task?.estimate_minutes),
      projectId: inputValue(task?.project_id ?? defaults?.projectId),
      parentTaskId: inputValue(task?.parent_task_id ?? defaults?.parentTaskId),
      categoryId: inputValue(task?.category_id),
      goalId: inputValue(task?.goal_id),
      notes: task?.notes ?? '',
    },
  });

  // Mãe possível: tarefa de primeiro nível, que não seja esta. Uma tarefa que já tem
  // subtarefas não pode virar subtarefa (um nível só — regra do banco).
  const hasChildren = task ? tasks.some((t) => t.parent_task_id === task.id) : false;
  const parentOptions = tasks.filter(
    (t) => t.parent_task_id === null && t.id !== task?.id && t.status !== 'cancelled',
  );
  const pending = isSubmitting || create.isPending || update.isPending;

  const onSubmit = handleSubmit(async (v) => {
    const row = {
      title: v.title,
      description: v.description,
      priority: v.priority,
      start_on: v.startOn,
      due_on: v.dueOn,
      estimate_minutes: v.estimateMinutes,
      project_id: v.parentTaskId ? null : v.projectId,
      parent_task_id: v.parentTaskId,
      category_id: v.categoryId,
      goal_id: v.goalId,
      notes: v.notes,
    };
    try {
      const saved = task
        ? await update.mutateAsync({ id: task.id, patch: row })
        : await create.mutateAsync({ ...row, id: draftId });
      onSaved(saved);
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // O aviso de erro já foi exibido; o formulário continua aberto com os dados.
    }
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="flex flex-col gap-4"
      aria-label="Tarefa"
    >
      <TextField
        label="Título"
        autoComplete="off"
        error={errors.title?.message}
        {...register('title')}
      />
      <TextareaField
        label="Descrição"
        hint="O que precisa ser feito. Opcional."
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Prioridade" {...register('priority')}>
          {(['high', 'medium', 'low'] as const).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Estimativa (min)"
          inputMode="numeric"
          hint="Planejamento; o tempo real vem das atividades."
          error={errors.estimateMinutes?.message}
          {...register('estimateMinutes')}
        />
        <TextField
          label="Início"
          type="date"
          error={errors.startOn?.message}
          {...register('startOn')}
        />
        <TextField label="Prazo" type="date" error={errors.dueOn?.message} {...register('dueOn')} />
        <SelectField
          label="Projeto"
          hint="Subtarefas usam o projeto da tarefa-mãe."
          {...register('projectId')}
        >
          <option value="">Sem projeto</option>
          {projects
            .filter((p) => p.archived_at === null || p.id === task?.project_id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Subtarefa de"
          disabled={hasChildren}
          hint={hasChildren ? 'Esta tarefa já tem subtarefas.' : undefined}
          {...register('parentTaskId')}
        >
          <option value="">Nenhuma (tarefa principal)</option>
          {parentOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </SelectField>
        <SelectField label="Categoria" {...register('categoryId')}>
          <option value="">Sem categoria</option>
          {categories
            .filter((c) => c.archived_at === null || c.id === task?.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Meta"
          hint="Conta para metas de “tarefas concluídas”; com “só tarefas vinculadas”, apenas as ligadas a ela contam."
          {...register('goalId')}
        >
          <option value="">Sem meta</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </SelectField>
      </div>
      <TextareaField label="Observações" error={errors.notes?.message} {...register('notes')} />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : task ? 'Salvar alterações' : 'Criar tarefa'}
        </Button>
      </div>
    </form>
  );
}
