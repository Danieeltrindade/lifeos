import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { addDays, type ISODate } from '@/lib/date';
import { inputValue, optionalDate, optionalInt, optionalText } from '@/lib/forms';
import { fromLocalInput, toLocalInput } from '@/lib/zoned';
import type { Subject, Topic } from '@/services/data/queries';
import { topicOptions } from '../logic/topic-options';
import { masteryFromAccuracy, MASTERY_LABELS } from '../logic/reviews';
import { DIFFICULTY_LABELS } from '../logic/subjects';
import { MAX_SESSION_SECONDS, TECHNIQUE_LABELS, type Technique } from '../logic/timer';
import {
  useCorrectSession,
  useCreateManualSession,
  useSaveReflection,
  type Reflection,
  type Session,
} from '../data/studies-api';
import { useDraftId } from '@/lib/query/draft-id';

const sessionSchema = z.object({
  start: z.string().min(1, { error: 'Informe o início.' }),
  end: z.string().min(1, { error: 'Informe o fim.' }),
  subjectId: z.string(),
  topicId: z.string(),
  technique: z.enum(['free', 'pomodoro', 'review', 'exercises', 'reading', 'video']),
  note: optionalText(2000),
});

type SessionInput = z.input<typeof sessionSchema>;

function validateWindow(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return 'Datas inválidas.';
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!(end > start)) return 'O fim precisa ser depois do início.';
  if ((end - start) / 1000 > MAX_SESSION_SECONDS) return 'Uma sessão pode ter no máximo 24 horas.';
  if (end > Date.now() + 5 * 60_000) return 'A sessão não pode terminar no futuro.';
  return null;
}

/**
 * Registro manual de sessão (estudo feito sem o cronômetro) e correção de uma sessão
 * encerrada. Horários são digitados no fuso do PERFIL e validados aqui e no banco.
 */
interface SessionFormProps {
  session?: Session | undefined;
  subjects: readonly Subject[];
  topics: readonly Topic[];
  timezone: string;
  onClose: () => void;
}

export function SessionFormDialog({ open, ...props }: SessionFormProps & { open: boolean }) {
  return (
    <Dialog
      open={open}
      onClose={props.onClose}
      title={props.session ? 'Corrigir sessão' : 'Registrar sessão manualmente'}
      size="lg"
    >
      {/* Montado só quando aberto: os valores iniciais são calculados a cada abertura. */}
      <SessionForm {...props} />
    </Dialog>
  );
}

function SessionForm({ session, subjects, topics, timezone, onClose }: SessionFormProps) {
  const create = useCreateManualSession();
  const [draftId, renewDraftId] = useDraftId();
  const correct = useCorrectSession();
  const [now] = useState(() => new Date());
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SessionInput, unknown, z.output<typeof sessionSchema>>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      start: session
        ? toLocalInput(session.started_at, timezone)
        : toLocalInput(new Date(now.getTime() - 3600_000).toISOString(), timezone),
      end: session?.ended_at
        ? toLocalInput(session.ended_at, timezone)
        : toLocalInput(now.toISOString(), timezone),
      subjectId: inputValue(session?.subject_id),
      topicId: inputValue(session?.topic_id),
      technique: (session?.technique ?? 'free') as Technique,
      note: session?.note ?? '',
    },
  });
  const subjectId = useWatch({ control, name: 'subjectId' });
  const pending = isSubmitting || create.isPending || correct.isPending;

  const onSubmit = handleSubmit(async (v) => {
    const startedAt = fromLocalInput(v.start, timezone);
    const endedAt = fromLocalInput(v.end, timezone);
    const problem = validateWindow(startedAt, endedAt);
    if (problem || !startedAt || !endedAt) {
      setError('end', { message: problem ?? 'Datas inválidas.' });
      return;
    }
    const fields = {
      subject_id: v.subjectId || null,
      topic_id: v.subjectId ? v.topicId || null : null,
      technique: v.technique,
      note: v.note,
    };
    try {
      if (session) {
        await correct.mutateAsync({ id: session.id, startedAt, endedAt, patch: fields });
      } else {
        await create.mutateAsync({
          ...fields,
          id: draftId,
          started_at: startedAt,
          ended_at: endedAt,
        });
      }
      onClose();
      // Próximo registro: outro id (este já foi gravado).
      renewDraftId();
    } catch {
      // Erro já exibido.
    }
  });

  return (
    <form
      noValidate
      aria-label="Sessão"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      {session && (
        <Notice tone="info">
          Pausas fora do novo intervalo são ajustadas automaticamente; a atividade gerada pela
          sessão é recalculada.
        </Notice>
      )}
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
          hint={`Horários no fuso ${timezone}. Pode passar da meia-noite.`}
          error={errors.end?.message}
          {...register('end')}
        />
        <SelectField label="Matéria" {...register('subjectId')}>
          <option value="">Sem matéria</option>
          {subjects
            .filter((s) => s.archived_at === null || s.id === session?.subject_id)
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
        <SelectField label="Técnica" {...register('technique')}>
          {Object.entries(TECHNIQUE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      <TextareaField
        label="Anotações"
        rows={2}
        error={errors.note?.message}
        {...register('note')}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : session ? 'Salvar correção' : 'Registrar sessão'}
        </Button>
      </div>
    </form>
  );
}

const reflectionSchema = z
  .object({
    studied: optionalText(2000),
    understood: optionalText(2000),
    confusing: optionalText(2000),
    questions: optionalInt(0, 10000, 'número'),
    correct: optionalInt(0, 10000, 'número'),
    difficulty: optionalInt(1, 5, 'nível'),
    nextAction: optionalText(500),
    reviewOn: optionalDate,
  })
  .refine((v) => (v.correct ?? 0) <= (v.questions ?? 0), {
    error: 'Os acertos não podem passar do número de questões.',
    path: ['correct'],
  });

/**
 * Reflexão pós-sessão. Questões e acertos sugerem o domínio do tópico (registrado como
 * "sessão"); a data sugerida agenda a revisão do tópico.
 */
interface ReflectionProps {
  session: Session;
  reflection: Reflection | null;
  hasTopic: boolean;
  today: ISODate;
  onClose: () => void;
}

export function ReflectionDialog({
  open,
  session,
  ...props
}: Omit<ReflectionProps, 'session'> & { open: boolean; session: Session | null }) {
  return (
    <Dialog
      open={open && session !== null}
      onClose={props.onClose}
      title="Reflexão da sessão"
      size="lg"
    >
      {session && <ReflectionForm key={session.id} session={session} {...props} />}
    </Dialog>
  );
}

function ReflectionForm({ session, reflection, hasTopic, today, onClose }: ReflectionProps) {
  const save = useSaveReflection();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof reflectionSchema>, unknown, z.output<typeof reflectionSchema>>({
    resolver: zodResolver(reflectionSchema),
    defaultValues: {
      studied: reflection?.studied ?? '',
      understood: reflection?.understood ?? '',
      confusing: reflection?.confusing ?? '',
      questions:
        reflection && reflection.questions_count > 0 ? String(reflection.questions_count) : '',
      correct: reflection && reflection.questions_count > 0 ? String(reflection.correct_count) : '',
      difficulty: inputValue(reflection?.perceived_difficulty),
      nextAction: reflection?.next_action ?? '',
      reviewOn: inputValue(reflection?.suggested_review_on),
    },
  });
  const q = Number(useWatch({ control, name: 'questions' }) || 0);
  const c = Number(useWatch({ control, name: 'correct' }) || 0);
  const suggested =
    Number.isFinite(q) && Number.isFinite(c) && c <= q ? masteryFromAccuracy(q, c) : null;
  const pending = isSubmitting || save.isPending;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        p_session_id: session.id,
        p_studied: v.studied,
        p_understood: v.understood,
        p_confusing: v.confusing,
        p_questions_count: v.questions ?? 0,
        p_correct_count: v.correct ?? 0,
        ...(v.difficulty !== null ? { p_perceived_difficulty: v.difficulty } : {}),
        p_next_action: v.nextAction,
        ...(v.reviewOn ? { p_suggested_review_on: v.reviewOn } : {}),
      });
      onClose();
    } catch {
      // Erro já exibido.
    }
  });

  return (
    <form
      noValidate
      aria-label="Reflexão"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      <TextareaField
        label="O que estudei"
        rows={2}
        error={errors.studied?.message}
        {...register('studied')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextareaField
          label="O que entendi"
          rows={2}
          error={errors.understood?.message}
          {...register('understood')}
        />
        <TextareaField
          label="O que ainda está confuso"
          rows={2}
          error={errors.confusing?.message}
          {...register('confusing')}
        />
        <TextField
          label="Questões feitas"
          inputMode="numeric"
          error={errors.questions?.message}
          {...register('questions')}
        />
        <TextField
          label="Questões certas"
          inputMode="numeric"
          error={errors.correct?.message}
          {...register('correct')}
        />
        <SelectField
          label="Dificuldade percebida"
          error={errors.difficulty?.message}
          {...register('difficulty')}
        >
          <option value="">Não informar</option>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={String(d)}>
              {d} · {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Revisar em"
          type="date"
          min={addDays(today, 1)}
          hint={
            hasTopic
              ? 'Agenda a revisão do tópico.'
              : 'Escolha um tópico na sessão para agendar revisões.'
          }
          disabled={!hasTopic}
          error={errors.reviewOn?.message}
          {...register('reviewOn')}
        />
      </div>
      <TextField
        label="Próxima ação"
        error={errors.nextAction?.message}
        {...register('nextAction')}
      />
      {hasTopic && suggested !== null && (
        <Notice tone="info">
          Com {c} de {q} questões certas, o domínio do tópico será registrado como{' '}
          <strong>{MASTERY_LABELS[suggested]}</strong> (origem: sessão).
        </Notice>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          {reflection ? 'Cancelar' : 'Agora não'}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar reflexão'}
        </Button>
      </div>
    </form>
  );
}
