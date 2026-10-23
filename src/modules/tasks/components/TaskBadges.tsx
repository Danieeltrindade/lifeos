import { AlertTriangle, CalendarClock } from 'lucide-react';
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
