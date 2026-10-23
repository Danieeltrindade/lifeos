import { CheckCircle2, Circle, FolderKanban, Repeat, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatDateOnly } from '@/lib/date';
import type { ProjectSummary } from '@/types/domain';
import type { HabitToday } from '../useTodayPlan';
import { SectionLink } from './SectionLink';

export function HabitsTodaySection({ habits }: { habits: HabitToday[] }) {
  const done = habits.filter((h) => h.done).length;
  return (
    <Card aria-labelledby="dash-habits">
      <CardHeader
        title="Hábitos de hoje"
        titleId="dash-habits"
        icon={<Repeat className="size-4" />}
        description={`${String(done)} de ${String(habits.length)} feitos`}
        action={<SectionLink to="/habitos" label="Abrir hábitos" />}
      />
      <CardBody>
        <ul className="flex flex-col gap-2">
          {habits.map((h) => (
            <li key={h.id} className="flex items-center gap-2 text-body-sm">
              {h.done ? (
                <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
              ) : (
                <Circle aria-hidden="true" className="size-4 text-fg-subtle" />
              )}
              <span className={h.done ? 'text-fg-muted' : 'font-medium'}>{h.name}</span>
              <span className="sr-only">{h.done ? ': feito' : ': pendente'}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function ProjectsSection({ projects }: { projects: ProjectSummary[] }) {
  return (
    <Card aria-labelledby="dash-projects">
      <CardHeader
        title="Projetos ativos"
        titleId="dash-projects"
        icon={<FolderKanban className="size-4" />}
        action={<SectionLink to="/projetos" label="Abrir projetos" />}
      />
      <CardBody>
        <ul className="flex flex-col gap-4">
          {projects.map((p) => {
            const text =
              p.tasksTotal === 0
                ? 'Sem tarefas'
                : `${String(p.tasksDone)} de ${String(p.tasksTotal)} tarefas`;
            return (
              <li key={p.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <Link
                    to={`/projetos/${p.id}`}
                    className="min-w-0 truncate text-body-sm font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="shrink-0 text-caption text-fg-subtle tabular">{text}</span>
                </div>
                <ProgressBar
                  label={`Progresso de ${p.name}`}
                  value={p.tasksDone}
                  max={Math.max(p.tasksTotal, 1)}
                  valueText={text}
                />
                {p.dueOn && (
                  <p className="mt-1 text-caption text-fg-subtle">
                    Prazo: {formatDateOnly(p.dueOn)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

export function ActiveSessionBanner({ label, clock }: { label: string; clock: string }) {
  return (
    <Link
      to="/estudos/cronometro"
      className="mb-4 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-soft p-3 text-body-sm text-primary-soft-fg"
    >
      <Timer aria-hidden="true" className="size-5 shrink-0" />
      <span className="flex-1">
        {label} · <span className="font-semibold tabular">{clock}</span>
      </span>
      <Badge tone="primary">Abrir cronômetro</Badge>
    </Link>
  );
}
