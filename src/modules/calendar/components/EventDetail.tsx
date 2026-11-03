import { AlertTriangle, ExternalLink, Pencil, Scissors, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { addDays, formatDateOnly, formatDuration, formatTime, localDateIn } from '@/lib/date';
import type { Category, Subject, Task } from '@/services/data/queries';
import type { Tables } from '@/services/supabase/database.types';
import type { Habit } from '@/modules/habits/data/habit-api';
import { describeRule, parseRule } from '../logic/recurrence';
import {
  actualSecondsInBlock,
  KIND_LABELS,
  SOURCE_LABELS,
  type CalendarEvent,
  type CalendarItem,
} from '../logic/calendar-items';
import { useEventMutations, useSplitSeries } from '../data/calendar-api';
import { planSplit } from '../logic/series-edit';
import type { SplitEdit } from './EventForm';

export function EventDetail({
  item,
  event,
  activities,
  tasks,
  subjects,
  habits,
  categories = [],
  conflictsWith = [],
  timezone,
  onEdit,
  onEditOccurrence,
  onEditFollowing,
  onClose,
}: {
  item: CalendarItem;
  event: CalendarEvent | undefined;
  activities: readonly Tables<'activities'>[];
  tasks: readonly Task[];
  subjects: readonly Subject[];
  habits: readonly Habit[];
  categories?: readonly Category[];
  /** Títulos dos itens que se sobrepõem a esta ocorrência. */
  conflictsWith?: readonly string[];
  timezone: string;
  onEdit: (eventId: string) => void;
  onEditOccurrence?: () => void;
  onEditFollowing?: (split: SplitEdit) => void;
  onClose: () => void;
}) {
  const { remove, exception } = useEventMutations();
  const splitSeries = useSplitSeries();
  const [confirm, setConfirm] = useState<null | 'series' | 'occurrence' | 'following'>(null);
  const occ = item.occurrence;

  if (!event || !occ) {
    // Itens derivados: apenas leitura, com atalho para o módulo de origem.
    const link =
      item.source === 'task_due'
        ? { to: `/tarefas?tarefa=${item.taskId ?? ''}`, label: 'Abrir tarefa' }
        : item.source === 'review'
          ? { to: '/estudos/revisoes', label: 'Abrir revisões' }
          : { to: '/atividades', label: 'Abrir atividades' };
    return (
      <div className="flex flex-col gap-4">
        <Badge>{SOURCE_LABELS[item.source]}</Badge>
        <p className="text-body-sm text-fg-muted">
          {item.source === 'task_due' &&
            'Prazo de uma tarefa: vem do campo "prazo" da tarefa e não é um evento. Para mudar, edite a tarefa.'}
          {item.source === 'review' &&
            'Revisão prevista para este dia. Para adiar ou reagendar, use a tela de revisões.'}
          {item.source === 'done' &&
            'Tempo REALIZADO numa sessão de foco (pausas descontadas). Não é planejamento.'}
        </p>
        <Link
          to={link.to}
          className={buttonClasses('secondary', 'md', 'self-start')}
          onClick={onClose}
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          {link.label}
        </Link>
      </div>
    );
  }

  const rule = parseRule(event.recurrence_rule);
  const subject = subjects.find((s) => s.id === event.subject_id);
  const task = tasks.find((t) => t.id === event.task_id);
  const habit = habits.find((h) => h.id === event.habit_id);
  const isBlock = event.kind !== 'event';
  const category = categories.find((c) => c.id === event.category_id);
  const split = rule
    ? planSplit(
        {
          allDay: event.all_day,
          startsAt: event.starts_at,
          startDate: event.start_date,
          timezone: event.timezone,
          recurrenceRule: event.recurrence_rule,
        },
        occ.key,
      )
    : null;
  const plannedSeconds = occ.allDay ? null : (Date.parse(occ.end) - Date.parse(occ.start)) / 1000;
  const actualSeconds =
    !occ.allDay && (subject || task)
      ? actualSecondsInBlock(
          { start: occ.start, end: occ.end, subjectId: event.subject_id, taskId: event.task_id },
          activities,
        )
      : null;
  const startDay = occ.allDay ? occ.start : localDateIn(new Date(occ.start), timezone);
  const endDay = occ.allDay ? addDays(occ.end, -1) : localDateIn(new Date(occ.end), timezone);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={isBlock ? 'accent' : 'primary'}>{KIND_LABELS[event.kind] ?? event.kind}</Badge>
        {rule && <Badge>{describeRule(rule)}</Badge>}
        {occ.modified && <Badge tone="warning">Ocorrência alterada</Badge>}
        {occ.unsupportedRule && <Badge tone="warning">Repetição não suportada</Badge>}
        {category && (
          <Badge>
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              data-swatch=""
              style={{ background: category.color ?? 'var(--lo-fg-subtle)' }}
            />
            {category.name}
          </Badge>
        )}
      </div>
      {conflictsWith.length > 0 && (
        <Notice tone="warning" title="Conflito de horário">
          <span className="inline-flex items-start gap-1">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Sobrepõe-se a: {conflictsWith.join(', ')}. Nada foi alterado automaticamente.
          </span>
        </Notice>
      )}
      <p className="font-medium">
        {occ.allDay
          ? startDay === endDay
            ? `${formatDateOnly(startDay)} · dia inteiro`
            : `${formatDateOnly(startDay)} – ${formatDateOnly(endDay)} · dia inteiro`
          : `${formatDateOnly(startDay)} · ${formatTime(occ.start, timezone)}–${formatTime(occ.end, timezone)}${
              endDay !== startDay ? ` (termina ${formatDateOnly(endDay)})` : ''
            }`}
      </p>
      {event.description && (
        <p className="whitespace-pre-wrap text-body-sm text-fg-muted">{event.description}</p>
      )}
      {(subject || task || habit) && (
        <p className="text-body-sm">
          Vínculo: {subject && `matéria ${subject.name}`}
          {task && `tarefa “${task.title}”`}
          {habit && `hábito ${habit.name}`}
        </p>
      )}
      {plannedSeconds !== null && isBlock && (
        <dl className="grid grid-cols-2 gap-3 rounded-md bg-surface-muted p-3 text-body-sm">
          <div>
            <dt className="text-caption text-fg-subtle">Planejado</dt>
            <dd className="font-semibold">{formatDuration(plannedSeconds / 60)}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-subtle">Realizado no horário</dt>
            <dd className="font-semibold">
              {actualSeconds === null
                ? 'Sem vínculo para comparar'
                : formatDuration(actualSeconds / 60)}
            </dd>
          </div>
        </dl>
      )}
      {task && (
        <Notice tone="info">
          O bloco reserva tempo; ele não conclui a tarefa. Conclua-a na tela de tarefas.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {!occ.unsupportedRule && rule && onEditOccurrence && (
          <Button
            variant="secondary"
            icon={<Pencil className="size-4" />}
            onClick={onEditOccurrence}
          >
            Editar só esta
          </Button>
        )}
        {!occ.unsupportedRule && split?.kind === 'split' && onEditFollowing && (
          <Button
            variant="secondary"
            icon={<Scissors className="size-4" />}
            onClick={() => {
              onEditFollowing({
                occurrenceKey: occ.key,
                oldRule: split.oldRule,
                newRule: split.newRule,
              });
            }}
          >
            Editar esta e as seguintes
          </Button>
        )}
        {!occ.unsupportedRule && (
          <Button
            variant={rule ? 'ghost' : 'secondary'}
            icon={<Pencil className="size-4" />}
            onClick={() => {
              onEdit(event.id);
            }}
          >
            {rule ? 'Editar série' : 'Editar'}
          </Button>
        )}
        {rule && (
          <Button
            variant="ghost"
            icon={<X className="size-4" />}
            onClick={() => {
              setConfirm('occurrence');
            }}
          >
            Remover só esta ocorrência
          </Button>
        )}
        {split?.kind === 'split' && (
          <Button
            variant="ghost"
            icon={<X className="size-4" />}
            onClick={() => {
              setConfirm('following');
            }}
          >
            Remover esta e as seguintes
          </Button>
        )}
        <Button
          variant="ghost"
          icon={<Trash2 className="size-4" />}
          onClick={() => {
            setConfirm('series');
          }}
        >
          {rule ? 'Excluir série' : 'Excluir'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === 'following'}
        title="Remover esta e as próximas ocorrências?"
        confirmLabel="Remover a partir desta"
        pending={splitSeries.isPending}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          if (split?.kind !== 'split') return;
          splitSeries.mutate(
            {
              eventId: event.id,
              oldRule: split.oldRule,
              split: occ.allDay ? { date: occ.key } : { instant: occ.key },
              newRow: null,
            },
            {
              onSuccess: onClose,
              onSettled: () => {
                setConfirm(null);
              },
            },
          );
        }}
      >
        A série passa a terminar antes desta data (
        {String(split?.kind === 'split' ? split.keptOccurrences : 0)} ocorrência(s) anteriores
        ficam). O histórico passado não muda.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'occurrence'}
        title="Remover esta ocorrência?"
        confirmLabel="Remover ocorrência"
        pending={exception.isPending}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          exception.mutate(
            {
              event_id: event.id,
              kind: 'cancelled',
              original_starts_at: occ.allDay ? null : occ.key,
              original_date: occ.allDay ? occ.key : null,
            },
            {
              onSuccess: onClose,
              onSettled: () => {
                setConfirm(null);
              },
            },
          );
        }}
      >
        Só esta data some; as demais repetições continuam.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'series'}
        title={rule ? 'Excluir a série inteira?' : 'Excluir evento?'}
        confirmLabel={rule ? 'Excluir série' : 'Excluir evento'}
        pending={remove.isPending}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          remove.mutate(event.id, {
            onSuccess: onClose,
            onSettled: () => {
              setConfirm(null);
            },
          });
        }}
      >
        {rule
          ? 'Todas as ocorrências (passadas e futuras) e suas alterações serão excluídas.'
          : 'A exclusão é permanente.'}{' '}
        Tarefas, matérias e o tempo realizado não são afetados.
      </ConfirmDialog>
    </div>
  );
}
