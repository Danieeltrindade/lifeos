import { TrendingUp } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/date';
import type { DashboardInsights, WeekDay } from '../useDashboardInsights';
import { SectionLink } from './SectionLink';

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const LONG_DAY = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

function dayLabel(date: string, format: Intl.DateTimeFormat): string {
  return format.format(new Date(`${date}T12:00:00Z`)).replace('.', '');
}

/**
 * Progresso da semana: estudo por dia (stats_study, pausas descontadas) e, quando há matérias
 * com carga semanal, o percentual cumprido — a mesma conta exibida na tela Estudos.
 */
export function WeeklyProgress({
  week,
  weeklyTarget,
}: Pick<DashboardInsights, 'week' | 'weeklyTarget'>) {
  if (week.status === 'unavailable') return null;
  return (
    <Card aria-labelledby="dash-week">
      <CardHeader
        title="Progresso da semana"
        titleId="dash-week"
        icon={<TrendingUp className="size-4" />}
        action={<SectionLink to="/analises" label="Abrir análises" />}
      />
      <CardBody>
        {week.status === 'loading' ? (
          <div aria-hidden="true" className="flex items-end gap-4">
            <Skeleton className="size-28 rounded-full" />
            <Skeleton className="h-28 flex-1" />
          </div>
        ) : week.status === 'error' ? (
          <p role="status" className="text-body-sm text-fg-muted">
            Não foi possível carregar o estudo da semana. Os demais indicadores continuam
            atualizados.
          </p>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {weeklyTarget.status === 'ready' && weeklyTarget.value ? (
              <TargetRing
                done={weeklyTarget.value.doneMinutes}
                target={weeklyTarget.value.targetMinutes}
              />
            ) : (
              <div className="shrink-0 sm:w-32">
                <p className="text-caption text-fg-subtle">Estudo na semana</p>
                <p className="tabular text-metric font-semibold tracking-tight">
                  {formatDuration(week.value.totalMinutes)}
                </p>
                {weeklyTarget.status === 'ready' && (
                  <p className="text-caption text-fg-subtle">
                    Defina uma carga semanal nas matérias para acompanhar a meta.
                  </p>
                )}
              </div>
            )}
            <WeekBars days={week.value.days} />
          </div>
        )}
        {week.status === 'ready' && (
          <p className="mt-4 border-t border-border pt-3 text-caption text-fg-subtle">
            Total na semana:{' '}
            <span className="tabular font-semibold text-fg-muted">
              {formatDuration(week.value.totalMinutes)}
            </span>
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function TargetRing({ done, target }: { done: number; target: number }) {
  const pct = Math.round((done / target) * 100);
  const shown = Math.min(100, pct);
  const r = 44;
  const c = 2 * Math.PI * r;
  const reached = done >= target;
  return (
    <div
      role="img"
      aria-label={`${String(pct)}% da carga semanal de estudo: ${formatDuration(done)} de ${formatDuration(target)}`}
      className="relative mx-auto size-32 shrink-0 sm:mx-0"
    >
      <svg viewBox="0 0 112 112" className="size-full -rotate-90">
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          strokeWidth="10"
          className="stroke-progress-track"
        />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          className={cn(
            'transition-[stroke-dashoffset] duration-700 ease-out-soft',
            reached ? 'stroke-complete' : 'stroke-primary',
          )}
          style={{
            filter: 'drop-shadow(0 0 6px color-mix(in srgb, currentColor 40%, transparent))',
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="tabular text-title font-semibold tracking-tight">{pct}%</span>
        <span className="text-[0.6875rem] leading-tight text-fg-subtle">
          da carga
          <br />
          semanal
        </span>
      </div>
    </div>
  );
}

function WeekBars({ days }: { days: WeekDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  const summary = days
    .map(
      (d) =>
        `${dayLabel(d.date, LONG_DAY)}: ${d.isFuture ? 'ainda não chegou' : formatDuration(d.minutes)}`,
    )
    .join('; ');
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="sr-only">Estudo por dia nesta semana. {summary}.</figcaption>
      <ol aria-hidden="true" className="flex h-32 items-end justify-between gap-1.5 sm:gap-2">
        {days.map((d) => {
          const pct = (d.minutes / max) * 100;
          return (
            <li
              key={d.date}
              className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"
              title={`${dayLabel(d.date, LONG_DAY)}: ${formatDuration(d.minutes)}`}
            >
              <div className="relative flex w-full max-w-7 flex-1 items-end overflow-hidden rounded-md bg-progress-track/70">
                {d.isFuture ? (
                  <div className="h-full w-full border border-dashed border-border-strong/60 bg-transparent" />
                ) : (
                  <div
                    className={cn(
                      'w-full rounded-md transition-[height] duration-700 ease-out-soft',
                      d.isToday
                        ? 'bg-linear-to-t from-primary/70 to-primary shadow-[0_0_14px_-2px_var(--lo-primary)]'
                        : 'bg-linear-to-t from-primary/25 to-primary/60',
                    )}
                    style={{ height: d.minutes > 0 ? `${String(Math.max(6, pct))}%` : '0%' }}
                  />
                )}
              </div>
              <span
                className={cn(
                  'text-[0.6875rem] leading-none capitalize',
                  d.isToday ? 'font-semibold text-primary' : 'text-fg-subtle',
                )}
              >
                {dayLabel(d.date, WEEKDAY)}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
