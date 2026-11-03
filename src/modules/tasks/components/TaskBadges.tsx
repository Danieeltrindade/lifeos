import { AlertTriangle, CalendarClock, Flag } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { formatDateOnly, relativeDayLabel, type ISODate } from '@/lib/date';
import {
  isOverdue,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Priority,
  type TaskStatus,
} from '../logic/tasks';

const PRIORITY_TONES: Record<Priority, BadgeTone> = {
  high: 'danger',
  medium: 'accent',
  low: 'neutral',
};

export function PriorityBadge({ priority }: { priority: string }) {
  const p = (priority in PRIORITY_LABELS ? priority : 'medium') as Priority;
  return <Badge tone={PRIORITY_TONES[p]}>Prioridade {PRIORITY_LABELS[p].toLowerCase()}</Badge>;
}

const STATUS_TONES: Record<TaskStatus, BadgeTone> = {
  todo: 'neutral',
  in_progress: 'info',
  done: 'success',
  cancelled: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const s = (status in STATUS_LABELS ? status : 'todo') as TaskStatus;
  return <Badge tone={STATUS_TONES[s]}>{STATUS_LABELS[s]}</Badge>;
}

/** Prazo: atrasada (destaque, sem mudar o status), hoje, amanhã ou a data. */
export function DueBadge({
  dueOn,
  status,
  today,
}: {
  dueOn: ISODate | null;
  status: string;
  today: ISODate;
}) {
  if (!dueOn) return null;
  if (isOverdue({ status, due_on: dueOn }, today)) {
    return (
      <Badge tone="danger">
        <AlertTriangle aria-hidden="true" className="size-3" />
        Atrasada · {formatDateOnly(dueOn)}
      </Badge>
    );
  }
  const label = relativeDayLabel(dueOn, today);
  const near = label === 'Hoje' || label === 'Amanhã';
  return (
    <Badge tone={near && (status === 'todo' || status === 'in_progress') ? 'warning' : 'neutral'}>
      <CalendarClock aria-hidden="true" className="size-3" />
      {near ? label : formatDateOnly(dueOn)}
    </Badge>
  );
}

const PRIORITY_TEXT: Record<Priority, string> = {
  high: 'bg-danger-soft text-danger ring-danger/25',
  medium: 'bg-warning-soft text-warning ring-warning/25',
  low: 'bg-surface-muted text-fg-subtle ring-border',
};

/**
 * Prioridade em listas: selo discreto com bandeira + texto curto (a cor nunca é a única pista).
 */
export function PriorityFlag({ priority }: { priority: string }) {
  const p = (priority in PRIORITY_LABELS ? priority : 'medium') as Priority;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-px text-caption font-medium ring-1 ring-inset',
        PRIORITY_TEXT[p],
      )}
    >
      <Flag aria-hidden="true" className="size-3" />
      <span className="sr-only">Prioridade </span>
      {PRIORITY_LABELS[p]}
    </span>
  );
}

/** Prazo em listas: mesmo texto do DueBadge, como metadado (cor só quando pede atenção). */
export function DueMeta({
  dueOn,
  status,
  today,
}: {
  dueOn: ISODate | null;
  status: string;
  today: ISODate;
}) {
  if (!dueOn) return null;
  if (isOverdue({ status, due_on: dueOn }, today)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-danger-soft px-1.5 py-0.5 text-caption font-medium text-danger">
        <AlertTriangle aria-hidden="true" className="size-3" />
        Atrasada · {formatDateOnly(dueOn)}
      </span>
    );
  }
  const label = relativeDayLabel(dueOn, today);
  const near = label === 'Hoje' || label === 'Amanhã';
  const attention = near && (status === 'todo' || status === 'in_progress');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-caption',
        attention ? 'font-medium text-warning' : 'text-fg-subtle',
      )}
    >
      <CalendarClock aria-hidden="true" className="size-3" />
      {near ? label : formatDateOnly(dueOn)}
    </span>
  );
}
