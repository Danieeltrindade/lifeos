import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays } from '@/lib/date';
import { cn } from '@/lib/cn';
import { formatGoalValue, PERIOD_LABELS } from '@/modules/goals/logic/goals';
import { useStats } from '../data/stats-api';
import { goalPace, type Pace } from '../logic/visuals';
import { PaceBar } from './visuals';

const STATE_TEXT: Record<Pace['state'], string> = {
  done: 'Meta batida',
  ahead: 'Adiantado',
  on_track: 'No ritmo',
  behind: 'Atrasado',
  no_deadline: 'Sem prazo',
};

/**
 * "No ritmo ou atrasado?": para cada meta ativa, o ciclo que contém HOJE (independente do
 * período escolhido), comparando o valor com o ritmo linear até o fim do ciclo.
 */
export function GoalPaceSection() {
  const { today } = useUserCalendar();
  const stats = useStats('stats_goals', { from: today, to: addDays(today, 1) });
  if (stats.status !== 'success') return null;
  const cards = stats.data.goals
    .filter((g) => g.status === 'active' && !g.archived)
    .flatMap((g) => {
      const cycle = g.cycles.find((c) => !c.complete) ?? g.cycles[g.cycles.length - 1];
      return cycle ? [{ g, cycle, pace: goalPace(cycle, today) }] : [];
    });
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="goals-pace-title" className="mb-6">
      <h2 id="goals-pace-title" className="text-title-sm font-semibold">
        Metas: no ritmo ou atrasado?
      </h2>
      <p className="mt-1 mb-3 text-body-sm text-fg-muted">
        Ciclo atual de cada meta ativa. A marca na barra é onde você deveria estar hoje para bater a
        meta no prazo, num ritmo constante.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ g, cycle, pace }) => {
          const fmt = (v: number) => formatGoalValue(v, g.unit);
          const behind = pace.state === 'behind';
          const chip =
            pace.state === 'ahead' || pace.state === 'behind'
              ? `${STATE_TEXT[pace.state]} ${fmt(Math.abs(pace.diff ?? 0))}`
              : STATE_TEXT[pace.state];
          let tip: string;
          if (pace.state === 'done') tip = 'Alvo atingido neste ciclo.';
          else if (pace.state === 'no_deadline' || pace.projected === null)
            tip = 'Sem data final: não há ritmo para comparar.';
          else if (pace.projected >= cycle.target)
            tip = `No ritmo atual você chega a ${fmt(pace.projected)} — acima da meta.`;
          else
            tip = `No ritmo atual você chega a ${fmt(pace.projected)}. Para bater a meta: ${fmt(
              pace.perDayNeeded ?? 0,
            )} por dia até o fim${pace.daysLeft !== null ? ` (${String(pace.daysLeft + 1)} dias)` : ''}.`;
          return (
            <article
              key={g.goalId}
              className="flex flex-col gap-3 rounded-lg border border-border surface-card p-4 shadow-elev-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{g.title}</h3>
                  <p className="text-caption text-fg-subtle">
                    {(PERIOD_LABELS as Partial<Record<string, string>>)[g.period] ?? g.period}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold',
                    behind
                      ? 'bg-[var(--lo-orange-soft)] text-[var(--lo-text-orange)]'
                      : 'bg-primary-soft text-primary-soft-fg',
                  )}
                >
                  {chip}
                </span>
              </div>
              <p className="text-title font-semibold tabular-nums">
                {fmt(cycle.value)}{' '}
                <span className="text-body-sm font-normal text-fg-subtle">
                  de {fmt(cycle.target)}
                </span>
              </p>
              <PaceBar
                value={cycle.value}
                target={cycle.target}
                expected={pace.expected}
                behind={behind}
              />
              <p className="text-body-sm text-fg-muted">
                {pace.expected !== null && pace.state !== 'done' && (
                  <>Ritmo ideal hoje: {fmt(pace.expected)}. </>
                )}
                {tip}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
