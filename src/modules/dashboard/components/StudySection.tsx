import { BookOpen } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/States';
import { formatDuration } from '@/lib/date';
import type { StudySummary } from '@/types/domain';
import { SectionLink } from './SectionLink';

export function StudySection({ studies }: { studies: StudySummary }) {
  const hasData = studies.plannedMinutesToday > 0 || studies.actualMinutesLast7Days > 0;
  const maxSubject = Math.max(1, ...studies.topSubjectsLast7Days.map((s) => s.actualMinutes));

  return (
    <Card aria-labelledby="dash-studies" className="lg:col-span-5">
      <CardHeader
        title="Estudos"
        titleId="dash-studies"
        icon={<BookOpen className="size-4" />}
        action={<SectionLink to="/estudos" label="Abrir estudos" />}
      />
      <CardBody>
        {!hasData ? (
          <EmptyState
            compact
            title="Nenhuma sessão registrada"
            description="O tempo das sessões de foco, com pausas descontadas, aparecerá aqui."
          />
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-body-sm text-fg-muted">Hoje</p>
                <p className="text-caption text-fg-subtle">
                  {studies.sessionsToday} {studies.sessionsToday === 1 ? 'sessão' : 'sessões'}
                </p>
              </div>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="tabular text-display font-semibold tracking-tight">
                  {formatDuration(studies.actualMinutesToday)}
                </span>
                <span className="text-body-sm text-fg-subtle">
                  de {formatDuration(studies.plannedMinutesToday)} planejados
                </span>
              </p>
              <ProgressBar
                className="mt-3"
                label="Estudo realizado em relação ao planejado hoje"
                value={studies.actualMinutesToday}
                max={studies.plannedMinutesToday}
                valueText={`${formatDuration(studies.actualMinutesToday)} de ${formatDuration(studies.plannedMinutesToday)}`}
              />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-body-sm text-fg-muted">Últimos 7 dias</p>
                <p className="tabular text-body-sm font-medium">
                  {formatDuration(studies.actualMinutesLast7Days)}
                </p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {studies.topSubjectsLast7Days.map((s) => (
                  <li
                    key={s.subjectId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1"
                  >
                    <span className="truncate text-body-sm">{s.subjectName}</span>
                    <span className="tabular text-caption text-fg-subtle">
                      {formatDuration(s.actualMinutes)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-muted"
                    >
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${(s.actualMinutes / maxSubject) * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
