import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { ListSkeleton } from '@/components/ui/QueryState';
import {
  formatDateOnly,
  formatDuration,
  localDateIn,
  relativeDayLabel,
  type ISODate,
} from '@/lib/date';
import { inputValue, optionalInt, optionalText, requiredText } from '@/lib/forms';
import { mustList } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import type { Tables } from '@/services/supabase/database.types';
import { PRIORITY_LABELS } from '@/modules/tasks/logic/tasks';
import { DIFFICULTY_LABELS, masteryLabel, type MasteryEvent, type Topic } from '../logic/subjects';
import { MASTERY_LABELS, MASTERY_SOURCE_LABELS } from '../logic/reviews';
import { TECHNIQUE_LABELS, type Technique } from '../logic/timer';
import {
  useDeleteTopic,
  useRecordMastery,
  useReviewActions,
  useSaveTopic,
} from '../data/studies-api';
import { useDraftId } from '@/lib/query/draft-id';

const topicSchema = z.object({
  name: requiredText(200, 'o nome'),
  description: optionalText(2000),
  parentTopicId: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  difficulty: optionalInt(1, 5, 'nível'),
  notes: optionalText(10000),
});

/** Formulário de tópico/subtópico (subtópicos: um nível, mesma matéria — regra do banco). */
export function TopicForm({
  subjectId,
  topic,
  topics,
  defaultParentId,
  onSaved,
  onCancel,
}: {
  subjectId: string;
  topic?: Topic;
  topics: readonly Topic[];
  defaultParentId?: string | null;
  onSaved: (topic: Topic) => void;
  onCancel: () => void;
}) {
  const save = useSaveTopic();
  const [draftId, renewDraftId] = useDraftId();
  const hasChildren = topic ? topics.some((t) => t.parent_topic_id === topic.id) : false;
  const parents = topics.filter(
    (t) =>
      t.subject_id === subjectId &&
      t.parent_topic_id === null &&
      t.id !== topic?.id &&
      t.archived_at === null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof topicSchema>, unknown, z.output<typeof topicSchema>>({
    resolver: zodResolver(topicSchema),
    defaultValues: {
      name: topic?.name ?? '',
      description: topic?.description ?? '',
      parentTopicId: inputValue(topic?.parent_topic_id ?? defaultParentId),
      priority: (topic?.priority ?? 'medium') as 'low' | 'medium' | 'high',
      difficulty: inputValue(topic?.difficulty),
      notes: topic?.notes ?? '',
    },
  });
  const pending = isSubmitting || save.isPending;
  const onSubmit = handleSubmit(async (v) => {
    try {
      onSaved(
        await save.mutateAsync({
          ...(topic ? { id: topic.id } : {}),
          row: {
            ...(topic ? {} : { id: draftId }),
            subject_id: subjectId,
            name: v.name,
            description: v.description,
            parent_topic_id: v.parentTopicId || null,
            priority: v.priority,
            difficulty: v.difficulty,
            notes: v.notes,
          },
        }),
      );
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // Erro já exibido.
    }
  });
  return (
    <form
      noValidate
      aria-label="Tópico"
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
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Subtópico de"
          disabled={hasChildren}
          hint={hasChildren ? 'Este tópico já tem subtópicos.' : undefined}
          {...register('parentTopicId')}
        >
          <option value="">Nenhum (tópico principal)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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
        <SelectField
          label="Dificuldade percebida"
          error={errors.difficulty?.message}
          {...register('difficulty')}
        >
          <option value="">Não informada</option>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={String(d)}>
              {d} · {DIFFICULTY_LABELS[d]}
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
          {pending ? 'Salvando…' : topic ? 'Salvar tópico' : 'Criar tópico'}
        </Button>
      </div>
    </form>
  );
}

function useTopicSessionsQuery(topicId: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: ['sessions', 'topic', topicId],
    queryFn: async ({ signal }) => {
      const sessions = await mustList(
        client
          .from('focus_sessions')
          .select('*')
          .eq('topic_id', topicId)
          .eq('status', 'completed')
          .order('started_at', { ascending: false })
          .limit(20)
          .abortSignal(signal),
      );
      if (sessions.length === 0) return [];
      const ids = sessions.map((s) => s.id);
      const [activities, reflections] = await Promise.all([
        mustList(
          client
            .from('activities')
            .select('session_id, duration_seconds')
            .in('session_id', ids)
            .abortSignal(signal),
        ),
        mustList(
          client.from('session_reflections').select('*').in('session_id', ids).abortSignal(signal),
        ),
      ]);
      return sessions.map((s) => ({
        session: s,
        seconds: activities.find((a) => a.session_id === s.id)?.duration_seconds ?? 0,
        reflection: reflections.find((r) => r.session_id === s.id) ?? null,
      }));
    },
  });
}

/**
 * Detalhe do tópico: domínio (histórico, nunca um campo sobrescrito), estudo realizado,
 * revisão agendada e anotações.
 */
export function TopicDetail({
  topic,
  topics,
  events,
  card,
  today,
  timezone,
  onEdit,
  onDeleted,
}: {
  topic: Topic;
  topics: readonly Topic[];
  events: readonly MasteryEvent[];
  card: Tables<'review_cards'> | undefined;
  today: ISODate;
  timezone: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const record = useRecordMastery();
  const remove = useDeleteTopic();
  const reviews = useReviewActions();
  const sessions = useTopicSessionsQuery(topic.id);
  const [level, setLevel] = useState('');
  const [note, setNote] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const history = events
    .filter((e) => e.topic_id === topic.id)
    .sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1));
  const current = history[0];
  const children = topics.filter((t) => t.parent_topic_id === topic.id);
  const dateFmt = (iso: string) => formatDateOnly(localDateIn(new Date(iso), timezone));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="info">Domínio: {masteryLabel(current?.level)}</Badge>
        {current && <Badge>{MASTERY_SOURCE_LABELS[current.source] ?? current.source}</Badge>}
        <Badge tone={topic.priority === 'high' ? 'danger' : 'neutral'}>
          Prioridade {PRIORITY_LABELS[topic.priority as 'low' | 'medium' | 'high'].toLowerCase()}
        </Badge>
        {topic.difficulty !== null && (
          <Badge>Dificuldade {DIFFICULTY_LABELS[topic.difficulty]?.toLowerCase()}</Badge>
        )}
      </div>
      {topic.description && <p className="whitespace-pre-wrap">{topic.description}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={onEdit}>
          Editar
        </Button>
        <Button
          variant="ghost"
          icon={<Trash2 className="size-4" />}
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          Excluir
        </Button>
      </div>

      <section aria-labelledby="topic-mastery">
        <h3 id="topic-mastery" className="mb-1 text-body-sm font-semibold">
          Domínio
        </h3>
        <p className="mb-2 text-caption text-fg-subtle">
          O domínio atual é o registro mais recente. Ele vem de revisões, do aproveitamento em
          questões das sessões ou de um ajuste manual — cada um fica registrado com a origem.
        </p>
        {history.length > 0 && (
          <ol className="mb-3 flex flex-col gap-1 text-body-sm">
            {history.slice(0, 8).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-caption text-fg-subtle tabular">
                  {dateFmt(e.recorded_at)}
                </span>
                <span className="font-medium">{MASTERY_LABELS[e.level] ?? e.level}</span>
                <span className="text-caption text-fg-subtle">
                  {MASTERY_SOURCE_LABELS[e.source] ?? e.source}
                </span>
                {e.note && <span className="text-caption text-fg-muted">“{e.note}”</span>}
              </li>
            ))}
          </ol>
        )}
        <form
          className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (level === '') return;
            record.mutate(
              { topic_id: topic.id, level: Number(level), note: note.trim() },
              {
                onSuccess: () => {
                  setLevel('');
                  setNote('');
                },
              },
            );
          }}
        >
          <div className="flex flex-1 flex-col gap-1">
            <label
              htmlFor={`mastery-${topic.id}`}
              className="text-caption font-medium text-fg-subtle"
            >
              Ajuste manual
            </label>
            <select
              id={`mastery-${topic.id}`}
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
              }}
              className="h-10 rounded-md border border-border-strong bg-surface-raised px-2.5 text-body-sm"
            >
              <option value="">Escolha o nível…</option>
              {MASTERY_LABELS.map((label, i) => (
                <option key={label} value={String(i)}>
                  {i} · {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-[2] flex-col gap-1">
            <label
              htmlFor={`mastery-note-${topic.id}`}
              className="text-caption font-medium text-fg-subtle"
            >
              Motivo (opcional)
            </label>
            <input
              id={`mastery-note-${topic.id}`}
              value={note}
              maxLength={500}
              onChange={(e) => {
                setNote(e.target.value);
              }}
              className="h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
            />
          </div>
          <Button size="sm" type="submit" disabled={level === '' || record.isPending}>
            Registrar
          </Button>
        </form>
      </section>

      <section aria-labelledby="topic-review">
        <h3 id="topic-review" className="mb-2 text-body-sm font-semibold">
          Revisão
        </h3>
        {card ? (
          <p className="text-body-sm">
            {card.status === 'suspended'
              ? 'Suspensa'
              : `Próxima: ${relativeDayLabel(card.due_on, today)} (${formatDateOnly(card.due_on)})`}
            {' · '}
            {card.repetitions} {card.repetitions === 1 ? 'acerto seguido' : 'acertos seguidos'} ·
            intervalo {card.interval_days} d
          </p>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reviewDate) return;
              reviews.create.mutate({
                topic_id: topic.id,
                due_on: reviewDate,
                priority: topic.priority,
              });
            }}
          >
            <label htmlFor={`review-date-${topic.id}`} className="sr-only">
              Data da primeira revisão
            </label>
            <input
              id={`review-date-${topic.id}`}
              type="date"
              min={today}
              value={reviewDate}
              onChange={(e) => {
                setReviewDate(e.target.value);
              }}
              className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              type="submit"
              icon={<CalendarPlus className="size-4" />}
              disabled={!reviewDate || reviews.create.isPending}
            >
              Agendar revisão
            </Button>
          </form>
        )}
      </section>

      <section aria-labelledby="topic-sessions">
        <h3 id="topic-sessions" className="mb-2 text-body-sm font-semibold">
          Histórico de estudo
        </h3>
        {sessions.status === 'pending' ? (
          <ListSkeleton rows={2} />
        ) : sessions.status === 'error' ? (
          <p className="text-body-sm text-danger">Não foi possível carregar as sessões.</p>
        ) : sessions.data.length === 0 ? (
          <p className="text-body-sm text-fg-subtle">Nenhuma sessão registrada neste tópico.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.data.map(({ session, seconds, reflection }) => (
              <li key={session.id} className="rounded-md bg-surface-muted p-2.5 text-body-sm">
                <p className="font-medium">
                  {dateFmt(session.started_at)} · {formatDuration(seconds / 60)} ·{' '}
                  {TECHNIQUE_LABELS[session.technique as Technique]}
                </p>
                {reflection?.confusing && (
                  <p className="text-fg-muted">Ainda confuso: {reflection.confusing}</p>
                )}
                {reflection && reflection.questions_count > 0 && (
                  <p className="text-caption text-fg-subtle">
                    {reflection.correct_count}/{reflection.questions_count} questões certas
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {topic.notes && (
        <section aria-labelledby="topic-notes">
          <h3 id="topic-notes" className="mb-1 text-body-sm font-semibold">
            Observações
          </h3>
          <p className="whitespace-pre-wrap text-body-sm text-fg-muted">{topic.notes}</p>
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir tópico?"
        confirmLabel="Excluir tópico"
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          remove.mutate(topic.id, {
            onSuccess: onDeleted,
            onSettled: () => {
              setConfirmDelete(false);
            },
          });
        }}
      >
        Saem junto: {children.length > 0 ? `${String(children.length)} subtópicos, ` : ''}o
        histórico de domínio e a revisão agendada. Sessões e atividades continuam registradas, sem o
        tópico. Para guardar o histórico, edite o tópico em vez de excluir.
      </ConfirmDialog>
    </div>
  );
}
