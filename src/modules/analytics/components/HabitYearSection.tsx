import { useState } from 'react';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays } from '@/lib/date';
import { cn } from '@/lib/cn';
import { toCheckins, toRule } from '@/modules/habits/data/habit-api';
import { useCheckinsQuery, useHabitsQuery } from '@/services/data/queries';
import { formatPercent } from '../logic/metrics';
import { habitYear } from '../logic/visuals';
import { YearCalendarGrid } from './visuals';

const SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Seu ano em hábitos": quadriculado das últimas 53 semanas de um hábito escolhido. */
export function HabitYearSection() {
  const { today, weekStartsOn } = useUserCalendar();
  const habits = (useHabitsQuery().data ?? []).filter((h) => h.archived_at === null);
  const checkins = useCheckinsQuery(addDays(today, -380));
  const [picked, setPicked] = useState<string | null>(null);
  const habit = habits.find((h) => h.id === picked) ?? habits[0];
  if (!habit) return null;

  const cal = habitYear(
    toRule(habit),
    toCheckins(checkins.data ?? [], habit.id),
    today,
    weekStartsOn,
  );
  const unit = (n: number) =>
    cal.unit === 'weeks'
      ? n === 1
        ? '1 semana'
        : `${String(n)} semanas`
      : n === 1
        ? '1 dia'
        : `${String(n)} dias`;
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => SHORT[(weekStartsOn + i) % 7] ?? '');
  const stats = [
    { label: 'Sequência atual', value: unit(cal.current) },
    { label: 'Maior sequência', value: unit(cal.best) },
    ...(cal.rate !== null
      ? [{ label: 'Consistência em 12 meses', value: formatPercent(cal.rate) }]
      : []),
    {
      label: 'Dias feitos',
      value: cal.expected > 0 ? `${String(cal.done)} de ${String(cal.expected)}` : String(cal.done),
    },
  ];

  return (
    <section
      aria-labelledby="habit-year-title"
      className="mt-4 rounded-lg border border-border surface-card p-4 shadow-elev-1 sm:p-5 lg:mt-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="habit-year-title" className="text-title-sm font-semibold">
            Seu ano em hábitos
          </h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            Cada quadrado é um dia. Dias em que o hábito não era esperado ficam vazios e não quebram
            a sequência.
          </p>
        </div>
        {habits.length > 1 && (
          <div role="group" aria-label="Hábito" className="flex flex-wrap gap-1.5">
            {habits.map((h) => (
              <button
                key={h.id}
                type="button"
                aria-pressed={h.id === habit.id}
                onClick={() => {
                  setPicked(h.id);
                }}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-body-sm transition-colors',
                  h.id === habit.id
                    ? 'border-primary/50 bg-primary-soft font-medium text-primary-soft-fg'
                    : 'border-border-strong text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                {h.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md bg-surface-muted px-3.5 py-3">
            <dt className="text-caption text-fg-subtle">{s.label}</dt>
            <dd className="mt-0.5 text-title-sm font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {checkins.status === 'pending' ? (
        <div className="h-36 animate-pulse rounded-md bg-surface-muted" />
      ) : (
        <>
          <p className="sr-only">
            {habit.name}: feito em {String(cal.done)} dias nas últimas 53 semanas
            {cal.rate !== null ? `, ${formatPercent(cal.rate)} dos dias esperados` : ''}. Sequência
            atual de {unit(cal.current)}.
          </p>
          <YearCalendarGrid calendar={cal} weekdayLabels={weekdayLabels} />
        </>
      )}
    </section>
  );
}
