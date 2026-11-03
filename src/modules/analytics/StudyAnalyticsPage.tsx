import { pluralize } from '@/lib/text';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/button-classes';
import { EmptyState } from '@/components/ui/States';
import { addDays } from '@/lib/date';
import { useSubjectsQuery, useTopicsQuery } from '@/services/data/queries';
import { BarSeriesChart, ChartCard, DataTable, StatTile } from './components/charts';
import { colorAt, SERIES_PRIMARY } from './components/chart-colors';
import { ChartsGrid, HowCalculated, StatsGrid, StatsLoading } from './components/common';
import { compareText, axisMinutes } from './components/format';
import { usePeriod } from './components/use-period';
import { useStats } from './data/stats-api';
import { dailyTotals, formatPercent, formatSeconds, safeRate } from './logic/metrics';
import {
  bucketDescription,
  bucketLabel,
  evolutionBuckets,
  evolutionNote,
  GRANULARITY_LABELS,
  granularityFor,
} from './logic/evolution';
import { periodDays } from './logic/periods';

const minutes = (s: number) => Math.round(s / 60);
const fmtMinutes = (m: number) => formatSeconds(m * 60);

export function StudyAnalyticsPage() {
  const { period, comparison, today, weekStartsOn } = usePeriod();
  const current = useStats('stats_study', period);
  const previous = useStats('stats_study', comparison?.previous ?? null);
  const subjects = useSubjectsQuery().data ?? [];
  const topics = useTopicsQuery().data ?? [];
  const subjectIndex = new Map(subjects.map((s, i) => [s.id, i]));
  const subjectColor = (id: string | null) =>
    id === null ? 'var(--lo-fg-subtle)' : colorAt(subjectIndex.get(id) ?? 0);
  const subjectName = (id: string | null) =>
    id === null ? 'Sem matéria' : (subjects.find((s) => s.id === id)?.name ?? 'Matéria excluída');

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
        const accuracy = safeRate(d.questions.correct, d.questions.questions);
        const pauseShare = safeRate(
          d.sessions.grossSeconds - d.sessions.netSeconds,
          d.sessions.grossSeconds,
        );
        const empty = d.totals.seconds === 0 && d.reviews.attempts === 0;
        const granularity = granularityFor(periodDays(period));
        const series = evolutionBuckets(
          d.days,
          { granularity, today, weekStartsOn },
          {
            seconds: (x) => x.seconds,
          },
        );
        const seriesNote = evolutionNote(series, granularity, addDays(period.to, -1), today);
        const bySubject = [...d.bySubject].sort((a, b) => b.seconds - a.seconds);
        const grades = d.reviews.byGrade;
        return (
          <>
            <StatsGrid>
              <StatTile
                label="Tempo de estudo"
                value={formatSeconds(d.totals.seconds)}
                detail={`Cronômetro ${formatSeconds(d.totals.timerSeconds)} · manual ${formatSeconds(d.totals.manualSeconds)}`}
                comparison={compareText(d.totals.seconds, prev?.totals.seconds, formatSeconds)}
              />
              <StatTile
                label="Média por dia"
                value={totals.perDay === null ? '—' : formatSeconds(totals.perDay)}
                detail={`${String(totals.activeDays)} de ${String(totals.elapsedDays)} dias com estudo${
                  totals.perActiveDay !== null
                    ? ` · ${formatSeconds(totals.perActiveDay)} nos dias com estudo`
                    : ''
                }`}
              />
              <StatTile
                label="Sessões de foco"
                value={String(d.sessions.count)}
                detail={
                  d.sessions.count === 0
                    ? 'Nenhuma sessão iniciada no período'
                    : `${formatSeconds(d.sessions.netSeconds)} líquidos · pausas ${formatPercent(pauseShare)} do tempo`
                }
                comparison={compareText(d.sessions.count, prev?.sessions.count, String)}
              />
              <StatTile
                label="Questões"
                // Nenhuma reflexão informou questões: ausência de registro, não "0 questões".
                value={d.questions.questions === 0 ? '—' : String(d.questions.questions)}
                detail={
                  accuracy === null
                    ? 'Sem questões informadas nas reflexões'
                    : `${formatPercent(accuracy)} de acerto (${String(d.questions.correct)} certas)`
                }
              />
            </StatsGrid>

            {empty ? (
              <EmptyState
                icon={<BookOpen className="size-6" />}
                title="Nenhum estudo registrado neste período"
                description="Use o cronômetro ou lance um estudo em Atividades: os números aparecem aqui a partir dos registros."
                action={
                  <Link to="/estudos/cronometro" className={buttonClasses('secondary', 'md')}>
                    Abrir cronômetro
                  </Link>
                }
              />
            ) : (
              <ChartsGrid>
                <ChartCard
                  id="chart-study-days"
                  title={`Tempo de estudo ${GRANULARITY_LABELS[granularity].title}`}
                  description={[
                    'Minutos líquidos (pausas descontadas), no dia local em que aconteceram.',
                    seriesNote,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  table={
                    <DataTable
                      caption={`Tempo de estudo ${GRANULARITY_LABELS[granularity].title}`}
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
                      minutos: minutes(x.values.seconds),
                    }))}
                    series={[{ key: 'minutos', label: 'Tempo', color: SERIES_PRIMARY }]}
                    format={fmtMinutes}
                    axisFormat={axisMinutes}
                  />
                </ChartCard>
                <ChartCard
                  id="chart-study-subjects"
                  title="Tempo por matéria"
                  description="Cada matéria mantém a mesma cor em todas as telas."
                  table={
                    <DataTable
                      caption="Tempo por matéria"
                      columns={['Matéria', 'Tempo', 'Sessões']}
                      rows={bySubject.map((x) => [
                        subjectName(x.subjectId),
                        formatSeconds(x.seconds),
                        x.sessions,
                      ])}
                    />
                  }
                >
                  <BarSeriesChart
                    layout="vertical"
                    height={Math.max(160, bySubject.length * 36)}
                    data={bySubject.map((x) => ({
                      label: subjectName(x.subjectId),
                      minutos: minutes(x.seconds),
                    }))}
                    series={[{ key: 'minutos', label: 'Tempo', color: colorAt(0) }]}
                    rowColors={bySubject.map((x) => subjectColor(x.subjectId))}
                    format={fmtMinutes}
                    axisFormat={axisMinutes}
                  />
                  <ul className="mt-2 flex flex-wrap gap-3 text-caption text-fg-muted">
                    {bySubject.map((x) => (
                      <li key={x.subjectId ?? 'none'} className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2.5 rounded-full"
                          data-swatch=""
                          style={{ background: subjectColor(x.subjectId) }}
                        />
                        {subjectName(x.subjectId)}
                      </li>
                    ))}
                  </ul>
                </ChartCard>
                <ChartCard
                  id="chart-study-reviews"
                  title="Revisões feitas por nota"
                  description={`${pluralize(d.reviews.attempts, 'revisão', 'revisões')} no período · ${pluralize(d.reviews.postponed, 'adiamento', 'adiamentos')} · agora: ${pluralize(d.reviews.overdueNow, 'atrasada', 'atrasadas')} e ${String(d.reviews.dueTodayNow)} para hoje.`}
                  table={
                    <DataTable
                      caption="Revisões por nota"
                      columns={['Nota', 'Revisões']}
                      rows={[
                        ['1 · Errei', grades['1']],
                        ['2 · Difícil', grades['2']],
                        ['3 · Bom', grades['3']],
                        ['4 · Fácil', grades['4']],
                      ]}
                    />
                  }
                >
                  {d.reviews.attempts === 0 ? (
                    <p className="text-body-sm text-fg-subtle">
                      Nenhuma revisão feita no período. Conclua revisões em Estudos → Revisões para
                      ver a distribuição das notas.
                    </p>
                  ) : (
                    <BarSeriesChart
                      data={[
                        { label: 'Errei', revisoes: grades['1'] },
                        { label: 'Difícil', revisoes: grades['2'] },
                        { label: 'Bom', revisoes: grades['3'] },
                        { label: 'Fácil', revisoes: grades['4'] },
                      ]}
                      series={[{ key: 'revisoes', label: 'Revisões', color: SERIES_PRIMARY }]}
                      format={(v) => String(Math.round(v))}
                      integer
                    />
                  )}
                </ChartCard>
                <ChartCard
                  id="chart-study-topics"
                  title="Tópicos com mais tempo"
                  description="Até 10 tópicos; tempo sem tópico não aparece aqui."
                  table={
                    <DataTable
                      caption="Tempo por tópico"
                      columns={['Tópico', 'Matéria', 'Tempo']}
                      rows={d.byTopic
                        .slice(0, 10)
                        .map((t) => [
                          topics.find((x) => x.id === t.topicId)?.name ?? 'Tópico excluído',
                          subjectName(t.subjectId),
                          formatSeconds(t.seconds),
                        ])}
                    />
                  }
                >
                  {d.byTopic.length === 0 ? (
                    <p className="text-body-sm text-fg-subtle">
                      Nenhum estudo com tópico no período.
                    </p>
                  ) : (
                    <BarSeriesChart
                      layout="vertical"
                      height={Math.max(160, Math.min(10, d.byTopic.length) * 32)}
                      data={d.byTopic.slice(0, 10).map((t) => ({
                        label: topics.find((x) => x.id === t.topicId)?.name ?? 'Tópico excluído',
                        minutos: minutes(t.seconds),
                      }))}
                      series={[{ key: 'minutos', label: 'Tempo', color: SERIES_PRIMARY }]}
                      format={fmtMinutes}
                      axisFormat={axisMinutes}
                    />
                  )}
                </ChartCard>
              </ChartsGrid>
            )}
            <HowCalculated>
              <p>
                <strong>Tempo de estudo</strong>: soma das atividades de estudo (sessões de foco e
                lançamentos manuais) recortadas em cada dia local; pausas já descontadas. Uma sessão
                que cruza a meia-noite é dividida entre os dois dias.
              </p>
              <p>
                <strong>Média por dia</strong>: tempo ÷ dias já transcorridos do período (dias sem
                estudo contam como 0; dias futuros não contam).
              </p>
              <p>
                <strong>Sessões</strong>: sessões concluídas que COMEÇARAM no período e tiveram
                tempo líquido &gt; 0. Pausas = (bruto − líquido) ÷ bruto.
              </p>
              <p>
                <strong>Acerto</strong>: certas ÷ questões informadas nas reflexões; sem questões,
                não há porcentagem.
              </p>
              <p>
                <strong>Comparação</strong>: mesmo cálculo no período anterior equivalente; quando o
                anterior é 0, não mostramos porcentagem. Detalhes em docs/metrics.md.
              </p>
            </HowCalculated>
          </>
        );
      }}
    </StatsLoading>
  );
}
