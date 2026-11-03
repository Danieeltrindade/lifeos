import { NotebookPen, Pause, Pencil, Play, Plus, Square, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ListSkeleton } from '@/components/ui/QueryState';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useNow } from '@/hooks/useNow';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { formatDuration, formatTime, localDateIn, relativeDayLabel } from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import { fromLocalInput, toLocalInput } from '@/lib/zoned';
import {
  useSubjectsQuery,
  useTopicsQuery,
  type Subject,
  type Topic,
} from '@/services/data/queries';
import { FocusRing } from './components/FocusRing';
import { ReflectionDialog, SessionFormDialog } from './components/SessionDialogs';
import { topicOptions } from './logic/topic-options';
import {
  formatClock,
  isPaused,
  netSeconds,
  STALE_SESSION_SECONDS,
  TECHNIQUE_LABELS,
  type Technique,
} from './logic/timer';
import {
  useActiveSessionQuery,
  useDeleteSession,
  useRecentSessionsQuery,
  useSessionControl,
  useStartSession,
  type Pause as PauseRow,
  type Session,
  type SessionWithDetails,
} from './data/studies-api';

export function TimerPage() {
  const { timezone, today } = useUserCalendar();
  const active = useActiveSessionQuery();
  const subjects = useSubjectsQuery().data ?? [];
  const topics = useTopicsQuery().data ?? [];
  const recent = useRecentSessionsQuery();
  const [reflectFor, setReflectFor] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [correcting, setCorrecting] = useState<Session | null>(null);

  const reflectItem = recent.data?.find((r) => r.session.id === reflectFor);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {active.status === 'pending' ? (
          <ListSkeleton rows={2} />
        ) : active.status === 'error' ? (
          <ErrorState
            title="Não foi possível verificar a sessão em andamento"
            description={errorMessage(active.error)}
            onRetry={() => {
              void active.refetch();
            }}
          />
        ) : active.data ? (
          <ActiveTimer
            session={active.data.session}
            pauses={active.data.pauses}
            subjects={subjects}
            topics={topics}
            timezone={timezone}
            onCompleted={(sessionId) => {
              setReflectFor(sessionId);
            }}
          />
        ) : (
          <StartSession subjects={subjects} topics={topics} />
        )}
        <Button
          variant="secondary"
          className="self-start"
          icon={<Plus className="size-4" />}
          onClick={() => {
            setManualOpen(true);
          }}
        >
          Registrar sessão manualmente
        </Button>
      </div>

      <RecentSessions
        query={recent}
        subjects={subjects}
        topics={topics}
        timezone={timezone}
        today={today}
        onReflect={setReflectFor}
        onCorrect={setCorrecting}
      />

      <ReflectionDialog
        open={reflectFor !== null}
        session={reflectItem?.session ?? null}
        reflection={reflectItem?.reflection ?? null}
        hasTopic={Boolean(reflectItem?.session.topic_id)}
        today={today}
        onClose={() => {
          setReflectFor(null);
        }}
      />
      <SessionFormDialog
        open={manualOpen}
        subjects={subjects}
        topics={topics}
        timezone={timezone}
        onClose={() => {
          setManualOpen(false);
        }}
      />
      <SessionFormDialog
        open={correcting !== null}
        session={correcting ?? undefined}
        subjects={subjects}
        topics={topics}
        timezone={timezone}
        onClose={() => {
          setCorrecting(null);
        }}
      />
    </div>
  );
}

const POMODORO_MINUTES = 25;

function StartSession({
  subjects,
  topics,
}: {
  subjects: readonly Subject[];
  topics: readonly Topic[];
}) {
  const [params] = useSearchParams();
  const start = useStartSession();
  const preset = params.get('materia') ?? '';
  // null = o usuário ainda não escolheu; vale a matéria do link ("Estudar agora"), quando existir.
  const [subjectChoice, setSubjectId] = useState<string | null>(null);
  const subjectId = subjectChoice ?? (subjects.some((s) => s.id === preset) ? preset : '');
  const [topicId, setTopicId] = useState('');
  const [technique, setTechnique] = useState<Technique>('free');
  const [mode, setMode] = useState<'free' | 'pomodoro' | 'custom'>('free');
  const [minutes, setMinutes] = useState('50');

  const customValid = /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 1440;
  const planned =
    mode === 'pomodoro'
      ? POMODORO_MINUTES * 60
      : mode === 'custom' && customValid
        ? Number(minutes) * 60
        : null;

  return (
    <Card aria-labelledby="timer-start">
      <CardHeader
        title="Nova sessão de foco"
        titleId="timer-start"
        description="O tempo é registrado pelo relógio do servidor"
      />
      <CardBody className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-center">
        <FocusRing fraction={0} className="max-w-[11rem] sm:max-w-[13rem] md:max-w-none">
          <p className="text-[2.5rem] leading-none font-semibold tracking-[-0.03em] text-fg-muted tabular">
            {planned !== null ? formatClock(planned) : '00:00'}
          </p>
          <p className="mt-2 text-caption text-fg-subtle">
            {planned !== null ? 'Meta da sessão' : 'Sem meta de duração'}
          </p>
        </FocusRing>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'custom' && !customValid) return;
            start.mutate({
              ...(subjectId ? { p_subject_id: subjectId } : {}),
              ...(subjectId && topicId ? { p_topic_id: topicId } : {}),
              ...(planned ? { p_planned_seconds: planned } : {}),
              p_technique: mode === 'pomodoro' ? 'pomodoro' : technique,
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Matéria"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTopicId('');
              }}
            >
              <option value="">Sem matéria</option>
              {subjects
                .filter((s) => s.archived_at === null && s.status !== 'completed')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </SelectField>
            <SelectField
              label="Tópico"
              value={topicId}
              disabled={!subjectId}
              onChange={(e) => {
                setTopicId(e.target.value);
              }}
            >
              <option value="">Sem tópico</option>
              {subjectId &&
                topicOptions(topics, subjectId).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </SelectField>
            <SelectField
              label="Duração"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
              }}
            >
              <option value="free">Livre (sem meta)</option>
              <option value="pomodoro">Pomodoro ({POMODORO_MINUTES} min)</option>
              <option value="custom">Personalizada</option>
            </SelectField>
            {mode === 'custom' ? (
              <TextField
                label="Minutos"
                inputMode="numeric"
                value={minutes}
                error={customValid ? undefined : 'Informe de 1 a 1440 minutos.'}
                onChange={(e) => {
                  setMinutes(e.target.value);
                }}
              />
            ) : (
              <SelectField
                label="Técnica"
                value={mode === 'pomodoro' ? 'pomodoro' : technique}
                disabled={mode === 'pomodoro'}
                onChange={(e) => {
                  setTechnique(e.target.value as Technique);
                }}
              >
                {Object.entries(TECHNIQUE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
          <Button
            type="submit"
            className="self-start"
            icon={<Play className="size-4" />}
            disabled={start.isPending}
          >
            {start.isPending ? 'Iniciando…' : 'Iniciar sessão'}
          </Button>
          <p className="text-caption text-fg-subtle">
            Pode fechar a aba ou recarregar: o cronômetro continua a partir dos horários gravados.
            Só existe uma sessão ativa por vez. O LifeOS não envia notificações — confira o
            cronômetro ao voltar.
          </p>
        </form>
      </CardBody>
    </Card>
  );
}

function ActiveTimer({
  session,
  pauses,
  subjects,
  topics,
  timezone,
  onCompleted,
}: {
  session: Session;
  pauses: PauseRow[];
  subjects: readonly Subject[];
  topics: readonly Topic[];
  timezone: string;
  onCompleted: (sessionId: string) => void;
}) {
  const now = useNow(1000);
  const control = useSessionControl();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [endAtOpen, setEndAtOpen] = useState(false);
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date().toISOString(), timezone));
  const paused = isPaused(pauses);
  const elapsed = netSeconds(session.started_at, pauses, null, now.getTime());
  const wall = Math.max(0, (now.getTime() - Date.parse(session.started_at)) / 1000);
  const stale = wall > STALE_SESSION_SECONDS;
  const planned = session.planned_seconds;
  const subject = subjects.find((s) => s.id === session.subject_id);
  const topic = topics.find((t) => t.id === session.topic_id);
  const busy =
    control.pause.isPending ||
    control.resume.isPending ||
    control.complete.isPending ||
    control.completeAt.isPending ||
    control.discard.isPending;

  return (
    <Card
      aria-labelledby="timer-active"
      className={paused ? undefined : 'border-primary/40 ring-1 ring-primary/15'}
    >
      <CardHeader
        title={paused ? 'Sessão pausada' : 'Sessão em andamento'}
        titleId="timer-active"
        description={`Início às ${formatTime(session.started_at, timezone)}`}
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-caption font-semibold ${paused ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}`}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${paused ? 'bg-warning' : 'animate-pulse bg-success'}`}
            />
            {paused ? 'Pausada' : 'Contando'}
          </span>
          {subject && <Badge tone="primary">{subject.name}</Badge>}
          {topic && <Badge>{topic.name}</Badge>}
          <Badge>{TECHNIQUE_LABELS[session.technique as Technique]}</Badge>
        </div>
        <FocusRing
          className="my-1"
          fraction={planned !== null ? elapsed / planned : (elapsed % 60) / 60}
          tone={planned !== null && elapsed >= planned ? 'success' : 'primary'}
          dimmed={paused}
        >
          <p
            className={`text-[2.75rem] leading-none font-semibold tracking-[-0.03em] tabular sm:text-[3.25rem] ${paused ? 'text-fg-subtle' : 'text-fg'}`}
            role="timer"
            aria-live="off"
            aria-label={`Tempo líquido: ${formatDuration(elapsed / 60)}`}
          >
            {formatClock(elapsed)}
          </p>
          <p className="mt-2 text-caption text-fg-subtle">
            {subject ? subject.name : 'Foco'}
            {planned !== null && ` · meta ${formatDuration(planned / 60)}`}
          </p>
        </FocusRing>
        {planned !== null && (
          <div className="flex flex-col gap-1.5">
            <ProgressBar
              value={Math.min(elapsed, planned)}
              max={planned}
              label="Meta da sessão"
              valueText={`${formatDuration(elapsed / 60)} de ${formatDuration(planned / 60)}`}
              tone={elapsed >= planned ? 'success' : 'primary'}
            />
            <p className="text-center text-body-sm text-fg-muted" aria-live="polite">
              {elapsed >= planned
                ? `Meta de ${formatDuration(planned / 60)} atingida — encerre quando quiser.`
                : `Faltam ${formatClock(planned - elapsed)} para a meta.`}
            </p>
          </div>
        )}
        {stale && (
          <Notice tone="warning" title="Sessão aberta há muito tempo">
            Parece que o cronômetro ficou ligado (por exemplo, a aba foi fechada). Use “Encerrar em
            outro horário” para registrar só o tempo real de estudo.
          </Notice>
        )}
        <div
          className="flex flex-wrap justify-center gap-2"
          role="group"
          aria-label="Controles do cronômetro"
        >
          {paused ? (
            <Button
              icon={<Play className="size-4" />}
              disabled={busy}
              onClick={() => {
                control.resume.mutate(session.id);
              }}
            >
              Retomar
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<Pause className="size-4" />}
              disabled={busy}
              onClick={() => {
                control.pause.mutate(session.id);
              }}
            >
              Pausar
            </Button>
          )}
          <Button
            icon={<Square className="size-4" />}
            disabled={busy}
            onClick={() => {
              control.complete.mutate(session.id, {
                onSuccess: () => {
                  onCompleted(session.id);
                },
              });
            }}
          >
            Encerrar
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setEndAtOpen((v) => !v);
            }}
            aria-expanded={endAtOpen}
          >
            Encerrar em outro horário
          </Button>
          <Button
            variant="ghost"
            icon={<X className="size-4" />}
            disabled={busy}
            onClick={() => {
              setConfirmDiscard(true);
            }}
          >
            Descartar
          </Button>
        </div>
        {endAtOpen && (
          <form
            className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const iso = fromLocalInput(endAt, timezone);
              if (!iso) return;
              control.completeAt.mutate(
                { id: session.id, endedAt: iso },
                {
                  onSuccess: () => {
                    onCompleted(session.id);
                  },
                },
              );
            }}
          >
            <TextField
              label="Terminei de estudar em"
              type="datetime-local"
              value={endAt}
              hint="Entre o início e agora. Pausas depois desse horário são descartadas."
              onChange={(e) => {
                setEndAt(e.target.value);
              }}
            />
            <Button type="submit" disabled={busy}>
              Encerrar neste horário
            </Button>
          </form>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar sessão?"
        confirmLabel="Descartar sessão"
        pending={control.discard.isPending}
        onCancel={() => {
          setConfirmDiscard(false);
        }}
        onConfirm={() => {
          control.discard.mutate(session.id, {
            onSettled: () => {
              setConfirmDiscard(false);
            },
          });
        }}
      >
        Nenhum tempo será registrado e nenhuma atividade será criada. Use quando a sessão foi
        iniciada por engano.
      </ConfirmDialog>
    </Card>
  );
}

function RecentSessions({
  query,
  subjects,
  topics,
  timezone,
  today,
  onReflect,
  onCorrect,
}: {
  query: ReturnType<typeof useRecentSessionsQuery>;
  subjects: readonly Subject[];
  topics: readonly Topic[];
  timezone: string;
  today: string;
  onReflect: (id: string) => void;
  onCorrect: (session: Session) => void;
}) {
  const remove = useDeleteSession();
  const [deleting, setDeleting] = useState<SessionWithDetails | null>(null);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const topicName = new Map(topics.map((t) => [t.id, t.name]));

  return (
    <section aria-labelledby="recent-sessions" className="min-w-0">
      <h2 id="recent-sessions" className="mb-3 text-title-sm font-semibold">
        Sessões recentes
      </h2>
      {query.status === 'pending' ? (
        <ListSkeleton rows={3} />
      ) : query.status === 'error' ? (
        <ErrorState
          description={errorMessage(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : query.data.length === 0 ? (
        <EmptyState
          compact
          title="Nenhuma sessão registrada"
          description="As sessões encerradas aparecem aqui, com a reflexão."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {query.data.map((item) => {
            const { session, durationSeconds, reflection } = item;
            const day = localDateIn(new Date(session.started_at), timezone);
            const endDay = session.ended_at
              ? localDateIn(new Date(session.ended_at), timezone)
              : day;
            return (
              <li
                key={session.id}
                className="rounded-lg border border-border surface-card px-4 py-3 shadow-elev-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {session.subject_id
                        ? (subjectName.get(session.subject_id) ?? 'Matéria')
                        : 'Sem matéria'}
                      {session.topic_id && topicName.has(session.topic_id) && (
                        <span className="font-normal text-fg-muted">
                          {' '}
                          · {topicName.get(session.topic_id)}
                        </span>
                      )}
                    </p>
                    <p className="text-caption text-fg-subtle">
                      {relativeDayLabel(day, today)} · {formatTime(session.started_at, timezone)}–
                      {session.ended_at ? formatTime(session.ended_at, timezone) : ''}
                      {endDay !== day && ' (dia seguinte)'} ·{' '}
                      {TECHNIQUE_LABELS[session.technique as Technique]}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular">
                    {formatDuration(durationSeconds / 60)}
                  </span>
                </div>
                {reflection?.studied && (
                  <p className="mt-1 line-clamp-2 text-body-sm text-fg-muted">
                    {reflection.studied}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<NotebookPen className="size-4" />}
                    onClick={() => {
                      onReflect(session.id);
                    }}
                  >
                    {reflection ? 'Ver reflexão' : 'Adicionar reflexão'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="size-4" />}
                    onClick={() => {
                      onCorrect(session);
                    }}
                  >
                    Corrigir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-4" />}
                    aria-label={`Excluir sessão de ${formatTime(session.started_at, timezone)}`}
                    onClick={() => {
                      setDeleting(item);
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Excluir sessão?"
        confirmLabel="Excluir sessão"
        pending={remove.isPending}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.session.id, {
            onSettled: () => {
              setDeleting(null);
            },
          });
        }}
      >
        Saem junto a atividade gerada, a reflexão e o domínio derivado dela. As estatísticas de
        tempo e as metas são recalculadas. Se o horário estava errado, prefira corrigir.
      </ConfirmDialog>
    </section>
  );
}
