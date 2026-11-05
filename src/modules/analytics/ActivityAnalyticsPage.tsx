import { Activity } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/ui/States';
import { addDays } from '@/lib/date';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { cn } from '@/lib/cn';
import { dateRange, zonedToUtc } from '@/lib/zoned';
import { useActivitiesQuery, useCategoriesQuery } from '@/services/data/queries';
import { KIND_LABELS } from '@/modules/activities/logic/activities';
import { BarSeriesChart, ChartCard, DataTable, StatTile } from './components/charts';
import { colorAt } from './components/chart-colors';
import { ChartsGrid, HowCalculated, StatsGrid, StatsLoading } from './components/common';
import { compareDirection, compareText, axisMinutes } from './components/format';
import { usePeriod } from './components/use-period';
import { useStats } from './data/stats-api';
import { change, dailyTotals, formatNumber, formatSeconds } from './logic/metrics';
import { secondsByDayAndKey } from './logic/visuals';
import {
  bucketDescription,
  bucketLabel,
  evolutionBuckets,
  evolutionNote,
  GRANULARITY_LABELS,
  granularityFor,
} from './logic/evolution';
import { periodDays } from './logic/periods';

const ACTIVITY_KIND_LABELS: Record<string, string> = KIND_LABELS;
const KIND_ORDER = Object.keys(ACTIVITY_KIND_LABELS);

const fmtMinutes = (m: number) => formatSeconds(m * 60);

export function ActivityAnalyticsPage() {
  const { period, comparison, today, weekStartsOn } = usePeriod();
  const { timezone } = useUserCalendar();
  const [focusKind, setFocusKind] = useState<string | null>(null);
  // Registros do período para repartir o tempo por tipo em cada dia (gráfico empilhado).
  const records = useActivitiesQuery(
    zonedToUtc(period.from, '00:00', timezone).toISOString(),
    zonedToUtc(period.to, '00:00', timezone).toISOString(),
  );
  const current = useStats('stats_activities', period);
  const previous = useStats('stats_activities', comparison?.previous ?? null);
  const categories = useCategoriesQuery().data ?? [];
  const catIndex = new Map(categories.map((c, i) => [c.id, i]));
  const catName = (id: string | null) =>
    id === null
      ? 'Sem categoria'
      : (categories.find((c) => c.id === id)?.name ?? 'Categoria excluída');

  return (
    <StatsLoading
      status={current.status}
      error={current.error}
      retry={() => void current.refetch()}
    >
      {() => {
        const d = current.data;
        if (!d) return null;
        const prev = previous.data;
        const totals = dailyTotals(
          d.days.map((x) => ({ date: x.date, value: x.seconds })),
          today,
        );
        const granularity = granularityFor(periodDays(period));
        const series = evolutionBuckets(
          d.days,
          { granularity, today, weekStartsOn },
          {
            seconds: (x) => x.seconds,
          },
        );
        const seriesNote = evolutionNote(series, granularity, addDays(period.to, -1), today);
        const byKind = [...d.byKind].sort((a, b) => b.seconds - a.seconds);
        // Tempo por dia e tipo (mesmo recorte por dia local do banco), agrupado como a série.
        const lastDay = addDays(period.to, -1) < today ? period.to : addDays(today, 1);
        const perDay = secondsByDayAndKey(
          records.data ?? [],
          (a) => a.kind,
          timezone,
          period.from,
          period.to,
        );
        const kindsUsed = KIND_ORDER.filter((k) =>
          d.byKind.some((x) => x.kind === k && x.seconds > 0),
        );
        const stacked = evolutionBuckets(
          dateRange(period.from, lastDay).map((date) => ({ date })),
          { granularity, today, weekStartsOn },
          Object.fromEntries(
            kindsUsed.map((k) => [k, (x: { date: string }) => perDay.get(x.date)?.get(k) ?? 0]),
          ),
        );
        const prevKind = new Map((prev?.byKind ?? []).map((k) => [k.kind, k.seconds]));
        const maxKind = Math.max(1, ...byKind.map((k) => k.seconds));
        const trend = series.map((x) => x.values.seconds);
        const byCategory = [...d.byCategory].sort((a, b) => b.seconds - a.seconds);
        return (
          <>
            <StatsGrid>
              <StatTile
                label="Tempo registrado"
                value={formatSeconds(d.totals.seconds)}
                detail={`${String(d.totals.count)} atividades iniciadas no período`}
                comparison={compareText(d.totals.seconds, prev?.totals.seconds, formatSeconds)}
                direction={compareDirection(d.totals.seconds, prev?.totals.seconds)}
                trend={trend}
              />
              <StatTile
                label="Média por dia"
                value={totals.perDay === null ? '—' : formatSeconds(totals.perDay)}
                detail={`${String(totals.activeDays)} de ${String(totals.elapsedDays)} dias com registro`}
              />
              <StatTile
                label="Leitura"
                value={`${String(d.reading.pages)} páginas`}
                detail={`${String(d.reading.count)} leituras · ${String(d.reading.titles)} títulos${
                  d.reading.count > d.reading.withPages
                    ? ` · ${String(d.reading.count - d.reading.withPages)} sem páginas informadas`
                    : ''
                }`}
              />
              <StatTile
                label="Exercício"
                value={`${formatNumber(d.exercise.distanceKm)} km`}
                detail={`${String(d.exercise.count)} sessões${
                  d.exercise.count > d.exercise.withDistance
                    ? ` · ${String(d.exercise.count - d.exercise.withDistance)} sem distância`
                    : ''
                }`}
              />
            </StatsGrid>
            {d.totals.count === 0 && d.totals.seconds === 0 ? (
              <EmptyState
                icon={<Activity className="size-6" />}
                title="Nenhuma atividade neste período"
                description="Registre atividades (estudo, trabalho, leitura, exercício…) para ver a distribuição do seu tempo."
              />
            ) : (
              <ChartsGrid>
                <ChartCard
                  id="chart-act-days"
                  title={`Seu tempo ${GRANULARITY_LABELS[granularity].title}`}
                  description={[
                    'Horas de cada tipo de atividade, recortadas em cada dia local.',
                    seriesNote,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  actions={
                    <div role="group" aria-label="Destacar tipo" className="flex flex-wrap gap-1.5">
                      {kindsUsed.map((k) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={focusKind === k}
                          onClick={() => {
                            setFocusKind((f) => (f === k ? null : k));
                          }}
                          className={cn(
                            'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-caption transition-colors',
                            focusKind === k
                              ? 'border-border-strong bg-surface-muted font-semibold text-fg'
                              : 'border-border text-fg-muted hover:bg-surface-muted',
                          )}
                        >
                          <span
                            aria-hidden="true"
                            data-swatch=""
                            className="size-2.5 rounded-[3px]"
                            style={{ background: colorAt(KIND_ORDER.indexOf(k)) }}
                          />
                          {ACTIVITY_KIND_LABELS[k] ?? k}
                        </button>
                      ))}
                    </div>
                  }
                  table={
                    <DataTable
                      caption={`Tempo por tipo ${GRANULARITY_LABELS[granularity].title}`}
                      columns={[
                        GRANULARITY_LABELS[granularity].column,
                        ...kindsUsed.map((k) => ACTIVITY_KIND_LABELS[k] ?? k),
                        'Total',
                      ]}
                      rows={series.map((x, i) => [
                        bucketDescription(x, granularity),
                        ...kindsUsed.map((k) => formatSeconds(stacked[i]?.values[k] ?? 0)),
                        formatSeconds(x.values.seconds),
                      ])}
                    />
                  }
                >
                  <BarSeriesChart
                    stacked
                    highlight={focusKind}
                    height={260}
                    data={stacked.map((x) => ({
                      label: bucketLabel(x, granularity),
                      ...Object.fromEntries(
                        kindsUsed.map((k) => [k, Math.round((x.values[k] ?? 0) / 60)]),
                      ),
                    }))}
                    series={kindsUsed.map((k) => ({
                      key: k,
                      label: ACTIVITY_KIND_LABELS[k] ?? k,
                      color: colorAt(KIND_ORDER.indexOf(k)),
                    }))}
                    format={fmtMinutes}
                    axisFormat={axisMinutes}
                  />
                </ChartCard>
                <section
                  aria-labelledby="chart-act-kinds"
                  className="rounded-lg border border-border surface-card p-4 shadow-elev-1 sm:p-5"
                >
                  <h2 id="chart-act-kinds" className="text-title-sm font-semibold">
                    Para onde foi seu tempo
                  </h2>
                  <p className="mt-1 mb-4 text-body-sm text-fg-muted">
                    Parte de cada tipo no período e a mudança desde o período anterior.
                  </p>
                  <ul className="flex flex-col gap-3.5">
                    {byKind.map((k) => {
                      const before = prevKind.get(k.kind);
                      const c = before === undefined ? null : change(k.seconds, before);
                      const share = d.totals.seconds > 0 ? k.seconds / d.totals.seconds : 0;
                      const label = ACTIVITY_KIND_LABELS[k.kind] ?? k.kind;
                      return (
                        <li key={k.kind} className="flex flex-col gap-1.5">
                          <div className="flex items-baseline gap-2 text-body-sm">
                            <span
                              aria-hidden="true"
                              data-swatch=""
                              className="size-2.5 shrink-0 rounded-[3px]"
                              style={{
                                background: colorAt(Math.max(0, KIND_ORDER.indexOf(k.kind))),
                              }}
                            />
                            <span className="flex-1">{label}</span>
                            <span className="font-semibold tabular-nums">
                              {formatSeconds(k.seconds)}
                            </span>
                            <span className="w-11 text-right text-fg-subtle tabular-nums">
                              {Math.round(share * 100)}%
                            </span>
                            <span
                              className={cn(
                                'w-24 text-right text-caption font-semibold tabular-nums',
                                c?.kind === 'up'
                                  ? 'text-[var(--lo-text-green)]'
                                  : c?.kind === 'down'
                                    ? 'text-[var(--lo-text-orange)]'
                                    : 'text-fg-subtle',
                              )}
                            >
                              {c === null
                                ? ''
                                : c.kind === 'up' || c.kind === 'down'
                                  ? `${c.kind === 'up' ? '▲' : '▼'} ${formatSeconds(Math.abs(c.delta))}`
                                  : c.kind === 'new'
                                    ? 'novo'
                                    : 'igual'}
                              <span className="sr-only">
                                {c && (c.kind === 'up' || c.kind === 'down')
                                  ? ` ${c.kind === 'up' ? 'a mais' : 'a menos'} que o período anterior`
                                  : ''}
                              </span>
                            </span>
                          </div>
                          <div
                            aria-hidden="true"
                            className="h-2 rounded-full bg-[var(--lo-progress-track)]"
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${((k.seconds / maxKind) * 100).toFixed(1)}%`,
                                background: colorAt(Math.max(0, KIND_ORDER.indexOf(k.kind))),
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <ChartCard
                  id="chart-act-categories"
                  title="Tempo por categoria"
                  table={
                    <DataTable
                      caption="Tempo por categoria"
                      columns={['Categoria', 'Tempo', 'Atividades']}
                      rows={byCategory.map((c) => [
                        catName(c.categoryId),
                        formatSeconds(c.seconds),
                        c.count,
                      ])}
                    />
                  }
                >
                  <BarSeriesChart
                    layout="vertical"
                    height={Math.max(160, byCategory.length * 36)}
                    data={byCategory.map((c) => ({
                      label: catName(c.categoryId),
                      minutos: Math.round(c.seconds / 60),
                    }))}
                    series={[{ key: 'minutos', label: 'Tempo', color: colorAt(0) }]}
                    rowColors={byCategory.map((c) =>
                      c.categoryId === null
                        ? 'var(--lo-fg-subtle)'
                        : colorAt(catIndex.get(c.categoryId) ?? 0),
                    )}
                    format={fmtMinutes}
                    axisFormat={axisMinutes}
                  />
                </ChartCard>
              </ChartsGrid>
            )}
            <HowCalculated>
              <p>
                <strong>Tempo</strong>: duração líquida das atividades recortada em cada dia local
                (pausas de sessões de foco já descontadas). Uma atividade que cruza a meia-noite é
                dividida entre os dias; uma que começou antes do período conta só a parte dentro
                dele.
              </p>
              <p>
                <strong>Quantidade, leitura e exercício</strong>: atividades que COMEÇARAM no
                período. Leituras sem páginas e exercícios sem distância contam na quantidade, mas
                não somam páginas/quilômetros (valor ausente não vira 0 inventado — ele é informado
                à parte).
              </p>
            </HowCalculated>
          </>
        );
      }}
    </StatsLoading>
  );
}
