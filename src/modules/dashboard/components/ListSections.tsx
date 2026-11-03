import { CheckSquare, History, PenLine, RotateCcw, Sparkles, Target, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import {
  daysBetween,
  formatDateOnly,
  formatDuration,
  formatTime,
  relativeDayLabel,
  type ISODate,
} from '@/lib/date';
import type {
  ActivityEntry,
  GoalProgress,
  Recommendation,
  ReviewItem,
  TaskSummary,
} from '@/types/domain';
import { PriorityFlag } from '@/modules/tasks/components/TaskBadges';
import { SectionLink } from './SectionLink';

const KIND_LABELS: Record<string, string> = {
  study: 'Estudo',
  reading: 'Leitura',
  exercise: 'Exercício',
  project: 'Projeto',
  work: 'Trabalho',
  leisure: 'Lazer',
  other: 'Outra',
};

const PERIOD_LABEL: Record<GoalProgress['period'], string> = {
  once: 'Até o prazo',
  daily: 'Hoje',
  weekly: 'Nesta semana',
  monthly: 'Neste mês',
};

const rowClass = 'flex items-start gap-3 py-3 first:pt-0 last:pb-0';

const amountFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
function formatAmount(value: number): string {
  return amountFormat.format(value);
}

/** today = data local do perfil (vinda do servidor); prazos são datas de calendário. */
export function TasksSection({ tasks, today }: { tasks: TaskSummary[]; today: ISODate }) {
  return (
    <Card aria-labelledby="dash-tasks">
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
              const overdue = task.dueOn !== null && daysBetween(task.dueOn, today) < 0;
              return (
                <li key={task.id} className={cn(rowClass, 'items-center')}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-8 w-[3px] shrink-0 rounded-full',
                      task.priority === 'high'
                        ? 'bg-danger'
                        : task.priority === 'medium'
                          ? 'bg-warning'
                          : 'bg-border-strong',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">{task.title}</p>
                    <p className="truncate text-caption text-fg-subtle">
                      {task.projectName ?? 'Sem projeto'}
                      {task.status === 'in_progress' && ' · em andamento'}
                    </p>
                  </div>
                  <PriorityFlag priority={task.priority} />
                  {task.dueOn && (
                    <Badge tone={overdue ? 'danger' : 'neutral'}>
                      <time dateTime={task.dueOn}>{relativeDayLabel(task.dueOn, today)}</time>
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

export function ReviewsSection({
  reviews,
  today,
  counts,
}: {
  reviews: ReviewItem[];
  today: ISODate;
  counts: { overdue: number; dueToday: number };
}) {
  const summary = [
    counts.overdue > 0 && `${String(counts.overdue)} atrasada${counts.overdue === 1 ? '' : 's'}`,
    counts.dueToday > 0 && `${String(counts.dueToday)} para hoje`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card aria-labelledby="dash-reviews">
      <CardHeader
        title="Revisões"
        titleId="dash-reviews"
        icon={<RotateCcw className="size-4" />}
        {...(summary ? { description: summary } : {})}
        action={<SectionLink to="/estudos/revisoes" label="Abrir revisões" />}
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
              const diff = daysBetween(r.dueOn, today);
              return (
                <li key={r.id} className={rowClass}>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium">{r.topicName}</p>
                    <p className="text-caption text-fg-subtle">{r.subjectName}</p>
                  </div>
                  <Badge tone={diff < 0 ? 'danger' : diff === 0 ? 'accent' : 'neutral'}>
                    <time dateTime={r.dueOn}>{relativeDayLabel(r.dueOn, today)}</time>
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
    <Card aria-labelledby="dash-goals">
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
              const text = `${formatAmount(g.current)} de ${formatAmount(g.target)} ${g.unit}`;
              return (
                <li key={g.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-body-sm font-medium">
                      {g.title}
                      {g.progressMode === 'manual' && (
                        <Badge className="ml-2 align-middle">manual</Badge>
                      )}
                    </p>
                    <p className="tabular shrink-0 text-caption text-fg-subtle">{text}</p>
                  </div>
                  <ProgressBar
                    label={g.title}
                    value={g.current}
                    max={g.target}
                    valueText={text}
                    tone={g.current >= g.target ? 'success' : 'primary'}
                  />
                  <p className="mt-1 text-caption text-fg-subtle">
                    {PERIOD_LABEL[g.period]}
                    {g.dueOn && (
                      <>
                        {' · prazo '}
                        <time dateTime={g.dueOn}>{formatDateOnly(g.dueOn)}</time>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function ActivitiesSection({
  activities,
  timeZone,
}: {
  activities: ActivityEntry[];
  timeZone: string;
}) {
  return (
    <Card aria-labelledby="dash-activities">
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
                    className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface-muted text-fg-muted"
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
                      {a.category ?? KIND_LABELS[a.kind] ?? 'Atividade'} ·{' '}
                      <time dateTime={a.startedAt}>{formatTime(a.startedAt, timeZone)}</time>
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
    <Card aria-labelledby="dash-recs">
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
              <li
                key={r.id}
                className="rounded-md border border-border border-l-2 border-l-primary/60 bg-surface-muted/60 px-3.5 py-3"
              >
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
