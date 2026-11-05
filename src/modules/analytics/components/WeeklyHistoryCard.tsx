import { addDays, type ISODate } from '@/lib/date';
import { useStats } from '../data/stats-api';
import { evolutionBuckets } from '../logic/evolution';
import { formatSeconds } from '../logic/metrics';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { BarSeriesChart, ChartCard, DataTable } from './charts';
import { SERIES_PREVIOUS, SERIES_PRIMARY } from './chart-colors';
import { axisMinutes, dayLabel } from './format';

const WEEKS = 8;
const fmtMin = (m: number) => formatSeconds(m * 60);

/** Tempo registrado e tarefas concluídas nas 8 semanas que terminam na semana escolhida. */
export function WeeklyHistoryCard({ weekStart }: { weekStart: ISODate }) {
  const { today, weekStartsOn } = useUserCalendar();
  const range = { from: addDays(weekStart, -(WEEKS - 1) * 7), to: addDays(weekStart, 7) };
  const acts = useStats('stats_activities', range);
  const tasks = useStats('stats_tasks', range);
  if (acts.status !== 'success' || tasks.status !== 'success') return null;

  const opts = { granularity: 'week' as const, today, weekStartsOn };
  const time = evolutionBuckets(acts.data.days, opts, { seconds: (x) => x.seconds });
  const done = new Map(
    evolutionBuckets(tasks.data.days, opts, { completed: (x) => x.completed }).map((b) => [
      b.key,
      b.values.completed,
    ]),
  );
  const rows = time.map((b) => ({
    key: b.key,
    label: dayLabel(b.key),
    minutes: Math.round(b.values.seconds / 60),
    completed: done.get(b.key) ?? 0,
    selected: b.key === weekStart,
  }));
  const selected = rows.find((r) => r.selected);
  const others = rows.filter((r) => !r.selected);
  const avg = others.length > 0 ? others.reduce((a, r) => a + r.minutes, 0) / others.length : null;

  return (
    <div className="mt-4 lg:mt-5">
      <ChartCard
        id="chart-week-history"
        title={`Tempo registrado nas últimas ${String(WEEKS)} semanas`}
        description={
          selected && avg !== null
            ? `A semana em destaque teve ${fmtMin(selected.minutes)}; a média das outras ${String(others.length)} foi ${fmtMin(Math.round(avg))}.`
            : 'Semanas sem registro aparecem vazias.'
        }
        table={
          <DataTable
            caption={`Últimas ${String(WEEKS)} semanas`}
            columns={['Semana de', 'Tempo registrado', 'Tarefas concluídas']}
            rows={rows.map((r) => [
              `${r.label}${r.selected ? ' (selecionada)' : ''}`,
              fmtMin(r.minutes),
              r.completed,
            ])}
          />
        }
      >
        <BarSeriesChart
          data={rows.map((r) => ({ label: r.label, minutos: r.minutes }))}
          series={[{ key: 'minutos', label: 'Tempo', color: SERIES_PRIMARY }]}
          rowColors={rows.map((r) => (r.selected ? SERIES_PRIMARY : SERIES_PREVIOUS))}
          reference={avg !== null ? { value: avg, label: `média ${axisMinutes(avg)}` } : null}
          format={fmtMin}
          axisFormat={axisMinutes}
          height={220}
        />
      </ChartCard>
    </div>
  );
}
