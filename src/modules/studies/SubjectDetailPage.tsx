import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CornerDownRight,
  Pencil,
  Plus,
  Timer,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ListSkeleton } from '@/components/ui/QueryState';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { useWeekWindow } from '@/hooks/useWeekWindow';
import { formatDateOnly, formatDuration, relativeDayLabel } from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import {
  useMasteryQuery,
  useReviewCardsQuery,
  useSubjectsQuery,
  useTopicsQuery,
  type Subject,
} from '@/services/data/queries';
import { SubjectForm } from './components/SubjectForm';
import { TopicDetail, TopicForm } from './components/TopicPanel';
import {
  DIFFICULTY_LABELS,
  latestMasteryByTopic,
  masteryDistribution,
  masteryLabel,
  SUBJECT_STATUS_LABELS,
  topicTree,
  type Topic,
} from './logic/subjects';
import { useArchiveSubject, useDeleteSubject, useStudyTimeQuery } from './data/studies-api';

export function SubjectDetailPage() {
  const { subjectId = '' } = useParams();
  const query = useSubjectsQuery();
  if (query.status === 'pending') return <ListSkeleton rows={3} />;
  if (query.status === 'error') {
    return (
      <ErrorState
        title="Não foi possível carregar a matéria"
        description={errorMessage(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  const subject = query.data.find((s) => s.id === subjectId);
  if (!subject) {
    return (
      <EmptyState
        title="Matéria não encontrada"
        description="Ela pode ter sido excluída."
        action={
          <Link to="/estudos" className="font-medium text-primary hover:underline">
            Voltar às matérias
          </Link>
        }
      />
    );
  }
  return <SubjectDetail key={subject.id} subject={subject} />;
}

type TopicDialogState =
  | { mode: 'closed' }
  | { mode: 'create'; parentId: string | null }
  | { mode: 'view'; topicId: string }
  | { mode: 'edit'; topicId: string };

function SubjectDetail({ subject }: { subject: Subject }) {
  const navigate = useNavigate();
  const { today, timezone } = useUserCalendar();
  const week = useWeekWindow();
  const topicsQuery = useTopicsQuery();
  const events = useMasteryQuery().data ?? [];
  const cards = useReviewCardsQuery().data ?? [];
  const time = useStudyTimeQuery(week.from, week.to).data ?? [];
  const archive = useArchiveSubject();
  const remove = useDeleteSubject();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dialog, setDialog] = useState<TopicDialogState>({ mode: 'closed' });

  const topics = topicsQuery.data ?? [];
  const tree = topicTree(topics, subject.id);
  const latest = latestMasteryByTopic(events);
  const cardByTopic = new Map(cards.map((c) => [c.topic_id, c]));
  const ownIds = topics.filter((t) => t.subject_id === subject.id).map((t) => t.id);
  const distribution = masteryDistribution(ownIds, latest);
  const seconds = time.find((t) => t.subject_id === subject.id)?.seconds ?? 0;
  const closeDialog = () => {
    setDialog({ mode: 'closed' });
  };
  const dialogTopic =
    dialog.mode === 'view' || dialog.mode === 'edit'
      ? topics.find((t) => t.id === dialog.topicId)
      : undefined;

  const row = (topic: Topic, nested: boolean) => {
    const mastery = latest.get(topic.id);
    const card = cardByTopic.get(topic.id);
    return (
      <li key={topic.id} className={`flex items-start gap-3 px-3 py-2.5 ${nested ? 'pl-9' : ''}`}>
        {nested && (
          <CornerDownRight aria-hidden="true" className="mt-2 size-4 shrink-0 text-fg-subtle" />
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="block w-full truncate py-1 text-left font-medium hover:underline"
            onClick={() => {
              setDialog({ mode: 'view', topicId: topic.id });
            }}
          >
            {topic.name}
          </button>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={mastery ? 'info' : 'neutral'}>{masteryLabel(mastery?.level)}</Badge>
            {topic.priority === 'high' && <Badge tone="danger">Prioridade alta</Badge>}
            {topic.difficulty !== null && <Badge>{DIFFICULTY_LABELS[topic.difficulty]}</Badge>}
            {card && card.status === 'active' && (
              <Badge tone={card.due_on <= today ? 'warning' : 'neutral'}>
                Revisão:{' '}
                {card.due_on <= today
                  ? relativeDayLabel(card.due_on, today)
                  : formatDateOnly(card.due_on)}
              </Badge>
            )}
          </div>
        </div>
        {!nested && (
          <button
            type="button"
            aria-label={`Adicionar subtópico em ${topic.name}`}
            onClick={() => {
              setDialog({ mode: 'create', parentId: topic.id });
            }}
            className="grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        )}
      </li>
    );
  };

  return (
    <div>
      <Link
        to="/estudos"
        className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-body-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Matérias
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-title font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="size-3.5 rounded-full"
              data-swatch=""
              style={{ backgroundColor: subject.color ?? 'var(--lo-fg-subtle)' }}
            />
            {subject.name}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{SUBJECT_STATUS_LABELS[subject.status] ?? subject.status}</Badge>
            {subject.term && <Badge>{subject.term}</Badge>}
            {subject.archived_at && <Badge tone="warning">Arquivada</Badge>}
          </div>
          {subject.objective && <p className="mt-2 text-fg-muted">Objetivo: {subject.objective}</p>}
          {subject.description && (
            <p className="mt-1 text-body-sm text-fg-muted">{subject.description}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to={`/estudos/cronometro?materia=${subject.id}`}
            className={buttonClasses('primary', 'md')}
          >
            <Timer aria-hidden="true" className="size-4" />
            Estudar agora
          </Link>
          <Button
            variant="secondary"
            icon={<Pencil className="size-4" />}
            onClick={() => {
              setEditing(true);
            }}
          >
            Editar
          </Button>
          <Button
            variant="secondary"
            icon={
              subject.archived_at ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <Archive className="size-4" />
              )
            }
            disabled={archive.isPending}
            onClick={() => {
              archive.mutate({ id: subject.id, archived: subject.archived_at === null });
            }}
          >
            {subject.archived_at ? 'Restaurar' : 'Arquivar'}
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="subject-topics" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="subject-topics" className="text-title-sm font-semibold">
              Tópicos
            </h2>
            <Button
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDialog({ mode: 'create', parentId: null });
              }}
            >
              Novo tópico
            </Button>
          </div>
          {topicsQuery.status === 'pending' ? (
            <ListSkeleton rows={3} />
          ) : topicsQuery.status === 'error' ? (
            <ErrorState
              description={errorMessage(topicsQuery.error)}
              onRetry={() => {
                void topicsQuery.refetch();
              }}
            />
          ) : tree.length === 0 ? (
            <EmptyState
              compact
              title="Nenhum tópico"
              description="Divida a matéria em tópicos e subtópicos para acompanhar domínio e revisões."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border surface-card shadow-elev-1">
              {tree.flatMap(({ topic, children }) => [
                row(topic, false),
                ...children.map((c) => row(c, true)),
              ])}
            </ul>
          )}
        </section>

        <Card aria-labelledby="subject-week">
          <CardHeader title="Esta semana" titleId="subject-week" />
          <CardBody className="flex flex-col gap-3">
            <p className="text-metric font-semibold tracking-[-0.02em] tabular">
              {formatDuration(seconds / 60)}
            </p>
            {subject.target_minutes_per_week !== null ? (
              <>
                <ProgressBar
                  value={seconds / 60}
                  max={subject.target_minutes_per_week}
                  label="Carga semanal"
                  valueText={`${formatDuration(seconds / 60)} de ${formatDuration(subject.target_minutes_per_week)}`}
                  tone={seconds / 60 >= subject.target_minutes_per_week ? 'success' : 'primary'}
                />
                <p className="text-caption text-fg-subtle">
                  Carga pretendida: {formatDuration(subject.target_minutes_per_week)} por semana.
                  Tempo real vem das sessões e atividades de estudo (pausas descontadas).
                </p>
              </>
            ) : (
              <p className="text-caption text-fg-subtle">
                Defina uma carga semanal pretendida para comparar.
              </p>
            )}
            {distribution.length > 0 && (
              <div>
                <h3 className="mb-1 text-body-sm font-semibold">Domínio dos tópicos</h3>
                <ul className="flex flex-col gap-0.5 text-body-sm">
                  {distribution.map((d) => (
                    <li key={String(d.level)} className="flex justify-between">
                      <span className="text-fg-muted">{masteryLabel(d.level)}</span>
                      <span className="tabular">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={editing}
        onClose={() => {
          setEditing(false);
        }}
        title="Editar matéria"
        size="lg"
      >
        <SubjectForm
          subject={subject}
          onSaved={() => {
            setEditing(false);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      </Dialog>

      <Dialog
        open={dialog.mode === 'create'}
        onClose={closeDialog}
        title={dialog.mode === 'create' && dialog.parentId ? 'Novo subtópico' : 'Novo tópico'}
        size="lg"
      >
        <TopicForm
          subjectId={subject.id}
          topics={topics}
          defaultParentId={dialog.mode === 'create' ? dialog.parentId : null}
          onSaved={(t) => {
            setDialog({ mode: 'view', topicId: t.id });
          }}
          onCancel={closeDialog}
        />
      </Dialog>

      <Dialog
        open={dialogTopic !== undefined}
        onClose={closeDialog}
        title={dialog.mode === 'edit' ? 'Editar tópico' : (dialogTopic?.name ?? '')}
        size="lg"
      >
        {dialogTopic &&
          (dialog.mode === 'edit' ? (
            <TopicForm
              subjectId={subject.id}
              topic={dialogTopic}
              topics={topics}
              onSaved={(t) => {
                setDialog({ mode: 'view', topicId: t.id });
              }}
              onCancel={() => {
                setDialog({ mode: 'view', topicId: dialogTopic.id });
              }}
            />
          ) : (
            <TopicDetail
              topic={dialogTopic}
              topics={topics}
              events={events}
              card={cardByTopic.get(dialogTopic.id)}
              today={today}
              timezone={timezone}
              onEdit={() => {
                setDialog({ mode: 'edit', topicId: dialogTopic.id });
              }}
              onDeleted={closeDialog}
            />
          ))}
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir matéria?"
        confirmLabel="Excluir matéria"
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          remove.mutate(subject.id, {
            onSuccess: () => {
              void navigate('/estudos');
            },
            onSettled: () => {
              setConfirmDelete(false);
            },
          });
        }}
      >
        Saem junto: tópicos, histórico de domínio e revisões desta matéria. Sessões e atividades
        continuam registradas (sem a matéria), então o tempo estudado não some das estatísticas
        gerais. Metas ligadas à matéria impedem a exclusão. Para guardar tudo, prefira arquivar.
      </ConfirmDialog>
    </div>
  );
}
