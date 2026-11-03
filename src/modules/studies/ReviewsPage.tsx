import { CalendarClock, History, Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { ListSkeleton, QueryState } from '@/components/ui/QueryState';
import { EmptyState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays, formatDateOnly, localDateIn, relativeDayLabel, type ISODate } from '@/lib/date';
import { pluralize } from '@/lib/text';
import {
  useReviewCardsQuery,
  useSubjectsQuery,
  useTopicsQuery,
  type Subject,
  type Topic,
} from '@/services/data/queries';
import { PRIORITY_LABELS } from '@/modules/tasks/logic/tasks';
import { topicOptions } from './logic/topic-options';
import { groupReviews } from './logic/review-queue';
import {
  GRADE_LABELS,
  LADDER,
  nextInterval,
  SCHEDULE_REASON_LABELS,
  type Grade,
} from './logic/reviews';
import { useReviewActions, useReviewDetailQuery, type ReviewCard } from './data/studies-api';

export function ReviewsPage() {
  const { today, timezone } = useUserCalendar();
  const cardsQuery = useReviewCardsQuery();
  const topics = useTopicsQuery().data ?? [];
  const subjects = useSubjectsQuery().data ?? [];
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const card = cardsQuery.data?.find((c) => c.id === openCard);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-body-sm text-fg-muted">
          Regra simples e transparente: a cada revisão você dá uma nota; o próximo intervalo sobe
          numa escada de {LADDER.join(' · ')} dias (errar volta para amanhã). Não é um algoritmo
          “ótimo” — é fácil de prever e você pode adiar ou reagendar.
        </p>
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => {
            setCreating(true);
          }}
        >
          Nova revisão
        </Button>
      </div>
      <QueryState query={cardsQuery} title="Não foi possível carregar as revisões">
        {(cards) => {
          const groups = groupReviews(cards, today);
          if (groups.length === 0) {
            return (
              <EmptyState
                icon={<Repeat className="size-6" />}
                title="Nenhuma revisão agendada"
                description="Agende revisões a partir de um tópico, da reflexão de uma sessão ou aqui."
              />
            );
          }
          return (
            <div className="flex flex-col gap-6">
              {groups.map((g) => (
                <section key={g.id} aria-labelledby={`reviews-${g.id}`}>
                  <h2
                    id={`reviews-${g.id}`}
                    className="mb-2 flex items-center gap-2 text-body-sm font-semibold"
                  >
                    {g.title}
                    <Badge
                      tone={
                        g.id === 'overdue' ? 'danger' : g.id === 'today' ? 'warning' : 'neutral'
                      }
                    >
                      {g.cards.length}
                    </Badge>
                  </h2>
                  <ul className="flex flex-col divide-y divide-border rounded-lg border border-border surface-card shadow-elev-1">
                    {g.cards.map((c) => {
                      const topic = topicById.get(c.topic_id);
                      const subject = topic ? subjectById.get(topic.subject_id) : undefined;
                      return (
                        <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: subject?.color ?? 'var(--lo-fg-subtle)' }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{topic?.name ?? 'Tópico'}</p>
                            <p className="truncate text-caption text-fg-subtle">
                              {subject?.name ?? ''} · {relativeDayLabel(c.due_on, today)} (
                              {formatDateOnly(c.due_on)}) ·{' '}
                              {pluralize(c.repetitions, 'acerto seguido', 'acertos seguidos')}
                            </p>
                          </div>
                          {c.priority === 'high' && <Badge tone="danger">Alta</Badge>}
                          <Button
                            size="sm"
                            variant={
                              g.id === 'overdue' || g.id === 'today' ? 'primary' : 'secondary'
                            }
                            onClick={() => {
                              setOpenCard(c.id);
                            }}
                            aria-label={`Revisar ${topic?.name ?? 'tópico'}`}
                          >
                            Revisar
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </QueryState>

      <Dialog
        open={card !== undefined}
        onClose={() => {
          setOpenCard(null);
        }}
        title={card ? `Revisão: ${topicById.get(card.topic_id)?.name ?? 'tópico'}` : 'Revisão'}
        size="lg"
      >
        {card && (
          <ReviewPanel
            key={card.id}
            card={card}
            today={today}
            timezone={timezone}
            onDone={() => {
              setOpenCard(null);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        title="Nova revisão"
      >
        <NewReviewForm
          cards={cardsQuery.data ?? []}
          subjects={subjects}
          topics={topics}
          today={today}
          onDone={() => {
            setCreating(false);
          }}
        />
      </Dialog>
    </>
  );
}

function ReviewPanel({
  card,
  today,
  timezone,
  onDone,
}: {
  card: ReviewCard;
  today: ISODate;
  timezone: string;
  onDone: () => void;
}) {
  const actions = useReviewActions();
  const detail = useReviewDetailQuery(card.id);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(addDays(today, 1));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy =
    actions.complete.isPending ||
    actions.postpone.isPending ||
    actions.reschedule.isPending ||
    actions.setStatus.isPending;
  const dateFmt = (iso: string) => formatDateOnly(localDateIn(new Date(iso), timezone));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-sm text-fg-muted">
        Prevista para {relativeDayLabel(card.due_on, today).toLowerCase()} (
        {formatDateOnly(card.due_on)}) · intervalo atual {card.interval_days} d ·{' '}
        {pluralize(card.repetitions, 'acerto seguido', 'acertos seguidos')}
        {card.status === 'suspended' && ' · suspensa'}
      </p>

      <section aria-labelledby="review-grade">
        <h3 id="review-grade" className="mb-2 text-body-sm font-semibold">
          Como foi?
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([1, 2, 3, 4] as Grade[]).map((g) => {
            const next = nextInterval(card.repetitions, g);
            return (
              <button
                key={g}
                type="button"
                disabled={busy}
                onClick={() => {
                  actions.complete.mutate(
                    {
                      p_card_id: card.id,
                      p_grade: g,
                      ...(notes.trim() ? { p_notes: notes.trim() } : {}),
                    },
                    { onSuccess: onDone },
                  );
                }}
                className="flex min-h-16 flex-col items-center justify-center rounded-md border border-border-strong bg-surface-raised p-2 text-center hover:border-primary disabled:opacity-50"
              >
                <span className="font-semibold">{GRADE_LABELS[g].label}</span>
                <span className="text-caption text-fg-subtle">
                  próxima em {pluralize(next.days, 'dia', 'dias')}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <TextareaField
            label="Anotações da tentativa (opcional)"
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        </div>
      </section>

      <section aria-labelledby="review-schedule" className="flex flex-col gap-3">
        <h3 id="review-schedule" className="text-body-sm font-semibold">
          Adiar ou reagendar
        </h3>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7].map((d) => (
            <Button
              key={d}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                actions.postpone.mutate({ p_card_id: card.id, p_days: d }, { onSuccess: onDone });
              }}
            >
              Adiar {pluralize(d, 'dia', 'dias')}
            </Button>
          ))}
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            actions.reschedule.mutate(
              { p_card_id: card.id, p_due_on: date },
              { onSuccess: onDone },
            );
          }}
        >
          <TextField
            label="Nova data"
            type="date"
            min={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
          <Button
            type="submit"
            variant="secondary"
            icon={<CalendarClock className="size-4" />}
            disabled={busy || !date || date < today}
          >
            Reagendar
          </Button>
        </form>
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label="Prioridade"
            value={card.priority}
            onChange={(e) => {
              actions.setPriority.mutate({ id: card.id, priority: e.target.value });
            }}
          >
            {(['high', 'medium', 'low'] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </SelectField>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              actions.setStatus.mutate({
                id: card.id,
                status: card.status === 'active' ? 'suspended' : 'active',
              });
            }}
          >
            {card.status === 'active' ? 'Suspender' : 'Reativar'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            Excluir
          </Button>
        </div>
      </section>

      <section aria-labelledby="review-history">
        <h3 id="review-history" className="mb-2 flex items-center gap-2 text-body-sm font-semibold">
          <History aria-hidden="true" className="size-4" />
          Histórico
        </h3>
        {detail.status === 'pending' ? (
          <ListSkeleton rows={2} />
        ) : detail.status === 'error' ? (
          <p className="text-body-sm text-danger">Não foi possível carregar o histórico.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-1 text-caption font-medium text-fg-subtle">Tentativas</h4>
              {detail.data.attempts.length === 0 ? (
                <p className="text-body-sm text-fg-subtle">Nenhuma ainda.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-body-sm">
                  {detail.data.attempts.map((a) => (
                    <li key={a.id}>
                      <span className="tabular text-fg-subtle">{dateFmt(a.reviewed_at)}</span> ·{' '}
                      {GRADE_LABELS[a.grade as Grade].label}
                      {a.notes && <span className="text-fg-muted"> — {a.notes}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-1 text-caption font-medium text-fg-subtle">Datas</h4>
              <ul className="flex flex-col gap-1 text-body-sm">
                {detail.data.log.map((l) => (
                  <li key={l.id}>
                    <span className="tabular text-fg-subtle">{dateFmt(l.changed_at)}</span> ·{' '}
                    {SCHEDULE_REASON_LABELS[l.reason] ?? l.reason}:{' '}
                    {l.from_due_on ? `${formatDateOnly(l.from_due_on)} → ` : ''}
                    {formatDateOnly(l.to_due_on)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir revisão?"
        confirmLabel="Excluir revisão"
        pending={actions.remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          actions.remove.mutate(card.id, {
            onSuccess: onDone,
            onSettled: () => {
              setConfirmDelete(false);
            },
          });
        }}
      >
        Saem junto as tentativas e o histórico de datas desta revisão. O domínio do tópico
        registrado pelas revisões é mantido. Para pausar sem perder nada, prefira suspender.
      </ConfirmDialog>
    </div>
  );
}

function NewReviewForm({
  cards,
  subjects,
  topics,
  today,
  onDone,
}: {
  cards: readonly ReviewCard[];
  subjects: readonly Subject[];
  topics: readonly Topic[];
  today: ISODate;
  onDone: () => void;
}) {
  const { create } = useReviewActions();
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [date, setDate] = useState(today);
  const [priority, setPriority] = useState('medium');
  const withCard = new Set(cards.map((c) => c.topic_id));
  const options = subjectId
    ? topicOptions(topics, subjectId).filter((o) => !withCard.has(o.value))
    : [];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!topicId || !date) return;
        create.mutate({ topic_id: topicId, due_on: date, priority }, { onSuccess: onDone });
      }}
    >
      <SelectField
        label="Matéria"
        value={subjectId}
        onChange={(e) => {
          setSubjectId(e.target.value);
          setTopicId('');
        }}
      >
        <option value="">Escolha…</option>
        {subjects
          .filter((s) => s.archived_at === null)
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
        hint={
          subjectId && options.length === 0
            ? 'Todos os tópicos desta matéria já têm revisão.'
            : 'Um tópico tem no máximo uma revisão.'
        }
        onChange={(e) => {
          setTopicId(e.target.value);
        }}
      >
        <option value="">Escolha…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Primeira revisão em"
          type="date"
          min={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
        />
        <SelectField
          label="Prioridade"
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
          }}
        >
          {(['high', 'medium', 'low'] as const).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!topicId || !date || date < today || create.isPending}>
          Agendar revisão
        </Button>
      </div>
    </form>
  );
}
