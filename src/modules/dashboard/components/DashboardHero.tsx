import { CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Abertura do dashboard: saudação, data e resumo do dia sobre uma superfície com gradiente
 * e um relevo decorativo (puramente visual, oculto das tecnologias assistivas).
 */
export function DashboardHero({
  title,
  initial,
  date,
  dateTime,
  summary,
  badge,
  children,
}: {
  title: string;
  initial: string;
  date: string;
  dateTime: string;
  summary: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="dash-title"
      className="surface-hero relative isolate mb-4 overflow-hidden rounded-xl border border-border shadow-elev-2 lg:mb-5"
    >
      <Ridges />
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-primary/45 text-title-sm font-semibold text-primary-fg ring-4 ring-primary/15 sm:size-14 sm:text-title"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <h1
                id="dash-title"
                className="text-title font-semibold tracking-[-0.02em] text-balance sm:text-display"
              >
                {title}
              </h1>
              <p className="mt-0.5 text-body-sm text-pretty text-fg-muted sm:text-body">
                {summary}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {badge}
            <p className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 text-body-sm font-medium text-fg-muted backdrop-blur-sm">
              <CalendarDays aria-hidden="true" className="size-4 text-primary" />
              <time dateTime={dateTime}>{date}</time>
            </p>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function Ridges() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 220"
      preserveAspectRatio="xMaxYMax slice"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-full w-full"
    >
      <path
        d="M330 220 L470 96 L540 150 L640 52 L720 118 L800 70 L800 220 Z"
        fill="var(--lo-hero-ridge-1)"
      />
      <path
        d="M420 220 L540 128 L610 170 L700 104 L800 150 L800 220 Z"
        fill="var(--lo-hero-ridge-2)"
      />
      <path d="M0 220 L0 200 Q400 150 800 196 L800 220 Z" fill="var(--lo-hero-ridge-3)" />
    </svg>
  );
}
