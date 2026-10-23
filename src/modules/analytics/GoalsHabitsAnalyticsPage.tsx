import { Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { addDays } from '@/lib/date';
import { useCheckinsQuery, useHabitsQuery } from '@/services/data/queries';
import { toCheckins, toRule } from '@/modules/habits/data/habit-api';
import { formatGoalValue, MODE_LABELS, PERIOD_LABELS } from '@/modules/goals/logic/goals';
import { BarSeriesChart, ChartCard, DataTable, StatTile } from './components/charts';
import { colorAt } from './components/chart-colors';
import { ChartsGrid, HowCalculated, StatsGrid, StatsLoading } from './components/common';
import { dayLabel } from './components/format';
import { usePeriod } from './components/use-period';
import { useStats } from './data/stats-api';
import { goalCycleSummary } from './logic/goal-stats';
import { consistencyInRange } from './logic/habit-stats';
import { describeRateChange, formatPercent, safeRate } from './logic/metrics';

export function GoalsHabitsAnalyticsPage() {
  const { period, comparison, today, weekStartsOn } = usePeriod();
  const goals = useStats('stats_goals', period);
  const previousGoals = useStats('stats_goals', comparison?.previous ?? null);
  const habits = useHabitsQuery();
  // Uma leitura cobre o período atual e o anterior (comparação).
  const prev = comparison?.previous ?? null;
  const checkins = useCheckinsQuery(prev && prev.from < period.from ? prev.from : period.from);

  return (
    <StatsLoading status={goals.status} error={goals.error} retry={() => void goals.refetch()}>
      {() => {
        const list = goals.data?.goals ?? [];
        const summaries = list.map((g) => ({ g, s: goalCycleSummary(g) }));
        const finishedTotal = summaries.reduce((a, x) => a + x.s.finished, 0);
        const metTotal = summaries.reduce((a, x) => a + x.s.met, 0);
        const habitRows = (habits.data ?? [])
          .filter((h) => h.archived_at === null && h.start_on < period.to)
          .map((h, index) => ({
            h,
            index,
            c: consistencyInRange(
              toRule(h),
              toCheckins(checkins.data ?? [], h.id),
              period.from,
              period.to,
              today,
              weekStartsOn,
            ),
          }));
        const withBase = habitRows.filter((r) => r.c.rate !== null);
        const avgRate = safeRate(
          withBase.reduce((a, r) => a + r.c.met, 0),
          withBase.reduce((a, r) => a + r.c.eligible, 0),
        );
        // Comparação com o período anterior equivalente (mesmos hábitos; taxas em p.p.).
        const prevRows = prev
          ? habitRows.map((r) =>
              consistencyInRange(
                toRule(r.h),
                toCheckins(checkins.data ?? [], r.h.id),
                prev.from,
                prev.to,
                today,
                weekStartsOn,
              ),
            )
          : null;
        const prevAvgRate = prevRows
          ? safeRate(
              prevRows.reduce((a, c) => a + c.met, 0),
              prevRows.reduce((a, c) => a + c.eligible, 0),
            )
          : null;
        const prevSummaries = (previousGoals.data?.goals ?? []).map((g) => goalCycleSummary(g));
        const prevFinished = prevSummaries.reduce((a, x) => a + x.finished, 0);
        const prevMet = prevSummaries.reduce((a, x) => a + x.met, 0);
        const goalsComparison =
          prev && previousGoals.data
            ? describeRateChange(safeRate(metTotal, finishedTotal), safeRate(prevMet, prevFinished))
            : null;
        const habitsComparison = prev ? describeRateChange(avgRate, prevAvgRate) : null;
        return (
          <>
            <StatsGrid>
              <StatTile
                label="Ciclos de metas encerrados"
                value={String(finishedTotal)}
                detail={
                  finishedTotal === 0
                    ? 'Nenhum ciclo terminou no período'
                    : `${String(metTotal)} atingiram o alvo (${formatPercent(safeRate(metTotal, finishedTotal))})`
                }
                comparison={goalsComparison}
              />
              <StatTile
                label="Metas no período"
                value={String(list.length)}
                detail="Ativas, pausadas ou concluídas"
              />
              <StatTile
                label="Hábitos acompanhados"
                value={String(habitRows.length)}
                detail={`${String(withBase.length)} com dias/semanas esperados no período`}
              />
              <StatTile
                label="Consistência média"
                value={formatPercent(avgRate)}
                detail="Cumpridos ÷ esperados, somando todos os hábitos"
                comparison={habitsComparison}
              />
            </StatsGrid>

            <section aria-labelledby="goals-title" className="mb-6">
              <h2 id="goals-title" className="mb-3 text-title-sm font-semibold">
                Metas
              </h2>
              {list.length === 0 ? (
                <EmptyState
                  icon={<Target className="size-6" />}
                  title="Nenhuma meta neste período"
                  description="Metas aparecem aqui com o valor de cada ciclo, calculado dos registros."
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {summaries.map(({ g, s }) => (
                    <article
                      key={g.goalId}
                      className="rounded-lg border border-border bg-surface p-4"
                    >
                      <h3 className="font-semibold">{g.title}</h3>
                      <p className="text-caption text-fg-subtle">
                        {(MODE_LABELS as Partial<Record<string, { label: string }>>)[g.progressMode]
                          ?.label ?? g.progressMode}{' '}
                        · {(PERIOD_LABELS as Partial<Record<string, string>>)[g.period] ?? g.period}
                        {g.archived
                          ? ' · arquivada'
                          : g.status !== 'active'
                            ? ` · ${g.status === 'paused' ? 'pausada' : 'concluída'}`
                            : ''}
                      </p>
                      {s.finished > 0 && (
                        <p className="mt-1 text-body-sm">
                          {String(s.met)} de {String(s.finished)} ciclos encerrados atingiram o
                          alvo.
                        </p>
                      )}
                      {g.cycles.length === 0 ? (
                        <p className="mt-2 text-body-sm text-fg-subtle">Nenhum ciclo no período.</p>
                      ) : (
                        <div className="mt-2 max-h-56 overflow-auto">
                          <DataTable
                            caption={`Ciclos da meta ${g.title}`}
                            columns={['Ciclo', 'Valor', 'Alvo', 'Situação']}
                            rows={g.cycles.map((c) => [
                              c.end
                                ? `${dayLabel(c.start)}–${dayLabel(addDays(c.end, -1))}`
                                : `desde ${dayLabel(c.start)}`,
                              formatGoalValue(c.value, g.unit),
                              formatGoalValue(c.target, g.unit),
                              !c.complete
                                ? `em andamento (${formatPercent(safeRate(c.value, c.target))})`
                                : c.value >= c.target
                                  ? 'atingido'
                                  : `não atingido (${formatPercent(safeRate(c.value, c.target))})`,
                            ])}
                          />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <ChartsGrid>
              <ChartCard
                id="chart-habits"
                title="Consistência dos hábitos"
                description="Cumpridos ÷ esperados no período, até hoje. Hábitos sem dia esperado ficam sem barra."
                table={
                  <DataTable
                    caption="Consistência por hábito"
                    columns={[
                      'Hábito',
                      'Cumpridos',
                      'Esperados',
                      'Consistência',
                      ...(prevRows ? ['Período anterior'] : []),
                    ]}
                    rows={habitRows.map((r, i) => [
                      r.h.name,
                      r.c.met,
                      `${String(r.c.eligible)} ${r.c.unit === 'weeks' ? 'semanas' : 'dias'}`,
                      formatPercent(r.c.rate),
                      ...(prevRows ? [formatPercent(prevRows[i]?.rate ?? null)] : []),
                    ])}
                  />
                }
              >
                {habitRows.length === 0 ? (
                  <p className="text-body-sm text-fg-subtle">Nenhum hábito ativo neste período.</p>
                ) : (
                  <BarSeriesChart
                    layout="vertical"
                    height={Math.max(160, habitRows.length * 36)}
                    data={habitRows.map((r) => ({
                      label: r.h.name,
                      pct: r.c.rate === null ? null : Math.round(r.c.rate * 100),
                    }))}
                    series={[{ key: 'pct', label: 'Consistência', color: colorAt(2) }]}
                    rowColors={habitRows.map((r) => colorAt(r.index))}
                    format={(v) => `${String(Math.round(v))}%`}
                  />
                )}
              </ChartCard>
            </ChartsGrid>
            <HowCalculated>
              <p>
                <strong>Valor de cada ciclo</strong>: calculado no banco a partir dos registros que
                contam para a meta (atividades, sessões, reflexões, tarefas, marcações ou
                lançamentos manuais), no ciclo de calendário da meta.
              </p>
              <p>
                <strong>Alvo</strong>: o alvo que estava em vigor no fim do ciclo. Mudar a meta hoje
                não reescreve a avaliação de ciclos antigos.
              </p>
              <p>
                <strong>Comparação</strong>: taxas (consistência, ciclos atingidos) são comparadas
                em pontos percentuais com o período anterior equivalente — com o período atual em
                andamento, só os mesmos primeiros dias do anterior.
              </p>
              <p>
                <strong>Consistência</strong>: dias esperados (ou semanas, no modo “N por semana”)
                cumpridos ÷ esperados no período, até hoje. Hoje e a semana atual só entram se já
                foram cumpridos; uma marcação abaixo da meta por marcação não conta.
              </p>
              <p>
                Limitação: pausas de um hábito não ficam registradas no histórico; um hábito pausado
                hoje é avaliado como se tivesse ficado ativo no passado.
              </p>
            </HowCalculated>
          </>
        );
      }}
    </StatsLoading>
  );
}
