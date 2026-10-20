import { CheckSquare, History, PenLine, RotateCcw, Sparkles, Target, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import {
  calendarDaysBetween,
  formatDuration,
  formatShortDate,
  formatTime,
  relativeDayLabel,
} from '@/lib/date';
import type {
  ActivityEntry,
  GoalProgress,
  Priority,
  Recommendation,
  ReviewItem,
  TaskSummary,
} from '@/types/domain';
import { SectionLink } from './SectionLink';

const PRIORITY: Record<Priority, { label: string; dot: string }> = {
  high: { label: 'Alta', dot: 'bg-danger' },
  medium: { label: 'Média', dot: 'bg-warning' },
  low: { label: 'Baixa', dot: 'bg-fg-subtle' },
};

const rowClass = 'flex items-start gap-3 py-3 first:pt-0 last:pb-0';

export function TasksSection({ tasks, now }: { tasks: TaskSummary[]; now: Date }) {
  return (
    <Card aria-labelledby="dash-tasks" className="lg:col-span-7">
      <CardHeader
        title="Tarefas prioritárias"
        titleId="dash-tasks"
        icon={<CheckSquare className="size-4" />}
        action={<SectionLink to="/tarefas" label="Abrir tarefas" />}
      />
      <CardBody>
        {tasks.length === 0 ? (
          <EmptyState
            compact
            title="Nenhuma tarefa prioritária"
            description="Tarefas de alta prioridade ou com prazo próximo aparecerão aqui."
          />
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((task) => {
              const p = PRIORITY[task.priority];
              const overdue = task.dueAt !== null && new Date(task.dueAt) < now;
              return (
                <li key={task.id} className={rowClass}>
                  <span
                    aria-hidden="true"
                    className={cn('mt-1.5 size-2 shrink-0 rounded-full', p.dot)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium">{task.title}</p>
                    <p className="text-caption text-fg-subtle">
                      <span className="sr-only">Prioridade {p.label}. </span>
                      {task.projectName ?? 'Sem projeto'}
                      {task.status === 'in_progress' && ' · em andamento'}
                    </p>
                  </div>
                  {task.dueAt && (
                    <Badge tone={overdue ? 'danger' : 'neutral'}>
                      <time dateTime={task.dueAt}>{relativeDayLabel(task.dueAt, now)}</time>
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function ReviewsSection({ reviews, now }: { reviews: ReviewItem[]; now: Date }) {
  return (
    <Card aria-labelledby="dash-reviews" className="lg:col-span-5">
      <CardHeader
        title="Próximas revisões"
        titleId="dash-reviews"
        icon={<RotateCcw className="size-4" />}
        action={<SectionLink to="/estudos" label="Abrir estudos" />}
      />
      <CardBody>
        {reviews.length === 0 ? (
          <EmptyState
            compact
            title="Nenhuma revisão agendada"
            description="Revisões espaçadas dos tópicos estudados aparecerão aqui."
          />
        ) : (
          <ul className="divide-y divide-border">
            {reviews.map((r) => {
              const diff = calendarDaysBetween(new Date(r.dueAt), now);
              return (
                <li key={r.id} className={rowClass}>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium">{r.topicName}</p>
                    <p className="text-caption text-fg-subtle">{r.subjectName}</p>
                  </div>
                  <Badge tone={diff < 0 ? 'danger' : diff === 0 ? 'accent' : 'neutral'}>
                    <time dateTime={r.dueAt}>{relativeDayLabel(r.dueAt, now)}</time>
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function GoalsSection({ goals }: { goals: GoalProgress[] }) {
  return (
    <Card aria-labelledby="dash-goals" className="lg:col-span-4">
      <CardHeader
        title="Metas em andamento"
        titleId="dash-goals"
        icon={<Target className="size-4" />}
        action={<SectionLink to="/metas" label="Abrir metas" />}
      />
      <CardBody>
        {goals.length === 0 ? (
          <EmptyState
            compact
            title="Nenhuma meta ativa"
            description="Metas mensuráveis e seu progresso aparecerão aqui."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {goals.map((g) => {
              const text = `${g.current} de ${g.target} ${g.unit}`;
              return (
                <li key={g.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-body-sm font-medium">{g.title}</p>
                    <p className="tabular shrink-0 text-caption text-fg-subtle">{text}</p>
                  </div>
                  <ProgressBar
                    label={g.title}
                    value={g.current}
                    max={g.target}
                    valueText={text}
                    tone="accent"
                  />
                  {g.dueAt && (
                    <p className="mt-1 text-caption text-fg-subtle">
                      Prazo: <time dateTime={g.dueAt}>{formatShortDate(g.dueAt)}</time>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function ActivitiesSection({ activities }: { activities: ActivityEntry[] }) {
  return (
    <Card aria-labelledby="dash-activities" className="lg:col-span-4">
      <CardHeader
        title="Atividades recentes"
        titleId="dash-activities"
        icon={<History className="size-4" />}
        action={<SectionLink to="/atividades" label="Abrir atividades" />}
      />
      <CardBody>
        {activities.length === 0 ? (
          <EmptyState
            compact
            title="Nenhum registro ainda"
            description="Sessões de foco e lançamentos manuais aparecerão aqui."
          />
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((a) => {
              const SourceIcon = a.source === 'timer' ? Timer : PenLine;
              return (
                <li key={a.id} className={rowClass}>
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-muted"
                    title={
                      a.source === 'timer' ? 'Registrado pelo cronômetro' : 'Lançamento manual'
                    }
                  >
                    <SourceIcon aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">
                      {a.source === 'timer' ? 'Registrado pelo cronômetro' : 'Lançamento manual'}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium">{a.title}</p>
                    <p className="text-caption text-fg-subtle">
                      {a.category} · <time dateTime={a.startedAt}>{formatTime(a.startedAt)}</time>
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-caption text-fg-muted">
                    {formatDuration(a.durationMinutes)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function RecommendationsSection({ items }: { items: Recommendation[] }) {
  return (
    <Card aria-labelledby="dash-recs" className="md:col-span-2 lg:col-span-4">
      <CardHeader
        title="Recomendações"
        titleId="dash-recs"
        icon={<Sparkles className="size-4" />}
        action={<SectionLink to="/recomendacoes" label="Abrir recomendações" />}
      />
      <CardBody>
        {items.length === 0 ? (
          <EmptyState
            compact
            title="Ainda sem histórico suficiente"
            description="Sugestões só aparecem quando há registros reais para justificá-las — e sempre com o motivo."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((r) => (
              <li key={r.id} className="rounded-md border border-border bg-surface-muted p-3.5">
                <p className="text-body-sm font-medium">{r.title}</p>
                <p className="mt-1 text-caption text-fg-muted">
                  <span className="font-medium">Por quê: </span>
                  {r.rationale}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
