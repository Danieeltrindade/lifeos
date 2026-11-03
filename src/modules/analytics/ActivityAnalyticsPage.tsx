import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { addDays } from '@/lib/date';
import { useCategoriesQuery } from '@/services/data/queries';
import { KIND_LABELS } from '@/modules/activities/logic/activities';
import { BarSeriesChart, ChartCard, DataTable, StatTile } from './components/charts';
import { colorAt, SERIES_PRIMARY } from './components/chart-colors';
import { ChartsGrid, HowCalculated, StatsGrid, StatsLoading } from './components/common';
import { compareText, axisMinutes } from './components/format';
import { usePeriod } from './components/use-period';
import { useStats } from './data/stats-api';
import { dailyTotals, formatNumber, formatSeconds } from './logic/metrics';
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
        const byCategory = [...d.byCategory].sort((a, b) => b.seconds - a.seconds);
        return (
          <>
            <StatsGrid>
              <StatTile
                label="Tempo registrado"
                value={formatSeconds(d.totals.seconds)}
                detail={`${String(d.totals.count)} atividades iniciadas no período`}
                comparison={compareText(d.totals.seconds, prev?.totals.seconds, formatSeconds)}
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
                  title={`Tempo ${GRANULARITY_LABELS[granularity].title}`}
                  description={[
                    'Tempo de todas as atividades, recortado em cada dia local.',
                    seriesNote,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  table={
                    <DataTable
                      caption={`Tempo de atividades ${GRANULARITY_LABELS[granularity].title}`}
                      columns={[GRANULARITY_LABELS[granularity].column, 'Tempo']}
                      rows={series.map((x) => [
                        bucketDescription(x, granularity),
                        formatSeconds(x.values.seconds),
                      ])}
                    />
                  }
                >
                  <BarSeriesChart
                    data={series.map((x) => ({
                      label: bucketLabel(x, granularity),
                      minutos: Math.round(x.values.seconds / 60),
                    }))}
                    series={[{ key: 'minutos', label: 'Tempo', color: SERIES_PRIMARY }]}
                    format={fmtMinutes}
                    axisFormat={axisMinutes}
                  />
                </ChartCard>
                <ChartCard
                  id="chart-act-kinds"
                  title="Tempo por tipo"
                  table={
                    <DataTable
                      caption="Tempo por tipo de atividade"
                      columns={['Tipo', 'Tempo', 'Atividades']}
                      rows={byKind.map((k) => [
                        ACTIVITY_KIND_LABELS[k.kind] ?? k.kind,
                        formatSeconds(k.seconds),
                        k.count,
                      ])}
                    />
                  }
                >
                  <BarSeriesChart
                    layout="vertical"
                    height={Math.max(160, byKind.length * 36)}
                    data={byKind.map((k) => ({
                      label: ACTIVITY_KIND_LABELS[k.kind] ?? k.kind,
                      minutos: Math.round(k.seconds / 60),
                    }))}
                    series={[{ key: 'minutos', label: 'Tempo', color: colorAt(0) }]}
                    rowColors={byKind.map((k) => colorAt(Math.max(0, KIND_ORDER.indexOf(k.kind))))}
                    format={fmtMinutes}
                    axisFormat={axisMinutes}
                  />
                </ChartCard>
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
