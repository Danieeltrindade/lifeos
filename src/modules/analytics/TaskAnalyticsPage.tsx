import { pluralize } from '@/lib/text';
import { CheckSquare } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui/States';
import { addDays } from '@/lib/date';
import { useTasksQuery } from '@/services/data/queries';
import { BarSeriesChart, ChartCard, DataTable, StatTile } from './components/charts';
import { colorAt } from './components/chart-colors';
import { ChartsGrid, HowCalculated, StatsGrid, StatsLoading } from './components/common';
import { compareText, dayLabel } from './components/format';
import { usePeriod } from './components/use-period';
import { useStats } from './data/stats-api';
import {
  ESTIMATE_TOLERANCE,
  estimateAccuracy,
  formatNumber,
  formatPercent,
  onTimeRate,
  safeRate,
} from './logic/metrics';
import {
  bucketDescription,
  bucketLabel,
  evolutionBuckets,
  evolutionNote,
  GRANULARITY_LABELS,
  granularityFor,
} from './logic/evolution';
import { periodDays } from './logic/periods';

const STATUS: Record<string, string> = {
  planned: 'Planejado',
  active: 'Ativo',
  on_hold: 'Em pausa',
};

export function TaskAnalyticsPage() {
  const { period, comparison, weekStartsOn, today } = usePeriod();
  const current = useStats('stats_tasks', period);
  const previous = useStats('stats_tasks', comparison?.previous ?? null);
  const tasks = useTasksQuery().data ?? [];
  const title = (id: string) => tasks.find((t) => t.id === id)?.title ?? 'Tarefa excluída';

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
        const rate = onTimeRate(d.due);
        const acc = estimateAccuracy(d.estimates);
        // Só tarefas com tempo registrado entram no gráfico: "realizado = 0" seria ausência
        // de registro desenhada como zero. Maiores diferenças (em minutos) primeiro.
        const comparable = d.estimates
          .filter((e) => e.actualSeconds > 0)
          .sort(
            (a, b) =>
              Math.abs(b.actualSeconds / 60 - b.estimateMinutes) -
              Math.abs(a.actualSeconds / 60 - a.estimateMinutes),
          );
        const granularity = granularityFor(periodDays(period));
        const rows = evolutionBuckets(
          d.days,
          { granularity, today, weekStartsOn },
          {
            created: (x) => x.created,
            completed: (x) => x.completed,
          },
        );
        const rowsNote = evolutionNote(rows, granularity, addDays(period.to, -1), today);
        const empty = d.created === 0 && d.completed === 0 && d.due.total === 0 && d.openNow === 0;
        return (
          <>
            <StatsGrid>
              <StatTile
                label="Concluídas"
                value={String(d.completed)}
                detail={`${pluralize(d.created, 'criada', 'criadas')} · ${pluralize(d.cancelled, 'cancelada', 'canceladas')} no período`}
                comparison={compareText(d.completed, prev?.completed, String)}
              />
              <StatTile
                label="Prazos cumpridos"
                value={formatPercent(rate)}
                detail={
                  rate === null
                    ? 'Sem tarefas com prazo vencido ou concluído no período'
                    : `${String(d.due.doneOnTime)} no prazo · ${pluralize(d.due.doneLate, 'concluída com atraso', 'concluídas com atraso')} · ${pluralize(d.due.openOverdue, 'aberta vencida', 'abertas vencidas')}`
                }
              />
              <StatTile
                label="Abertas agora"
                value={String(d.openNow)}
                detail={`${String(d.overdueNow)} atrasadas hoje`}
              />
              <StatTile
                label="Realizado ÷ estimado"
                value={acc.medianRatio === null ? '—' : `${formatNumber(acc.medianRatio)}×`}
                detail={
                  acc.withTime === 0
                    ? `Sem tarefas concluídas com estimativa e tempo registrado (${String(acc.withEstimate)} com estimativa)`
                    : `Mediana de ${pluralize(acc.withTime, 'tarefa', 'tarefas')} · ${formatPercent(acc.withinTolerance)} dentro de ±${String(ESTIMATE_TOLERANCE * 100)}%`
                }
              />
            </StatsGrid>
            {empty ? (
              <EmptyState
                icon={<CheckSquare className="size-6" />}
                title="Nenhuma tarefa neste período"
                description="Crie tarefas com prazo e estimativa para acompanhar cumprimento e precisão."
              />
            ) : (
              <ChartsGrid>
                <ChartCard
                  id="chart-tasks-days"
                  title={`Tarefas ${GRANULARITY_LABELS[granularity].title}`}
                  description={['Criadas × concluídas, pelo dia local do evento.', rowsNote]
                    .filter(Boolean)
                    .join(' ')}
                  table={
                    <DataTable
                      caption="Tarefas criadas e concluídas"
                      columns={[GRANULARITY_LABELS[granularity].column, 'Criadas', 'Concluídas']}
                      rows={rows.map((x) => [
                        bucketDescription(x, granularity),
                        x.values.created,
                        x.values.completed,
                      ])}
                    />
                  }
                >
                  <BarSeriesChart
                    data={rows.map((x) => ({
                      label: bucketLabel(x, granularity),
                      criadas: x.values.created,
                      concluidas: x.values.completed,
                    }))}
                    series={[
                      { key: 'criadas', label: 'Criadas', color: colorAt(0) },
                      { key: 'concluidas', label: 'Concluídas', color: colorAt(2) },
                    ]}
                    format={(v) => String(Math.round(v))}
                    integer
                  />
                </ChartCard>
                <ChartCard
                  id="chart-tasks-estimates"
                  title="Estimado × realizado"
                  description={
                    comparable.length === d.estimates.length
                      ? 'Tarefas concluídas no período com estimativa e tempo registrado; maiores diferenças primeiro.'
                      : `Tarefas concluídas no período com estimativa e tempo registrado; maiores diferenças primeiro. ${pluralize(d.estimates.length - comparable.length, 'tarefa sem tempo registrado fica', 'tarefas sem tempo registrado ficam')} fora do gráfico (estão na tabela).`
                  }
                  table={
                    <DataTable
                      caption="Estimado e realizado por tarefa"
                      columns={['Tarefa', 'Estimado', 'Realizado', 'Diferença']}
                      rows={d.estimates.map((e) => {
                        const actual = Math.round(e.actualSeconds / 60);
                        return [
                          title(e.taskId),
                          `${String(e.estimateMinutes)} min`,
                          e.actualSeconds > 0 ? `${String(actual)} min` : 'sem registro',
                          e.actualSeconds > 0
                            ? `${actual - e.estimateMinutes >= 0 ? '+' : ''}${String(actual - e.estimateMinutes)} min`
                            : '—',
                        ];
                      })}
                    />
                  }
                >
                  {comparable.length === 0 ? (
                    <p className="text-body-sm text-fg-subtle">
                      {d.estimates.length === 0
                        ? 'Nenhuma tarefa concluída com estimativa no período.'
                        : 'Nenhuma tarefa concluída com estimativa tem tempo registrado no período. Registre o tempo (cronômetro ou atividade ligada à tarefa) para comparar.'}
                    </p>
                  ) : (
                    <BarSeriesChart
                      layout="vertical"
                      height={Math.max(160, Math.min(12, comparable.length) * 44)}
                      data={comparable.slice(0, 12).map((e) => ({
                        label: title(e.taskId),
                        estimado: e.estimateMinutes,
                        realizado: Math.round(e.actualSeconds / 60),
                      }))}
                      series={[
                        { key: 'estimado', label: 'Estimado', color: colorAt(0) },
                        { key: 'realizado', label: 'Realizado', color: colorAt(1) },
                      ]}
                      format={(v) => `${String(Math.round(v))} min`}
                    />
                  )}
                </ChartCard>
              </ChartsGrid>
            )}

            <section aria-labelledby="proj-title" className="mt-6">
              <h2 id="proj-title" className="mb-3 text-title-sm font-semibold">
                Projetos em andamento
              </h2>
              {d.projects.length === 0 ? (
                <p className="text-body-sm text-fg-subtle">
                  Nenhum projeto planejado, ativo ou em pausa.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-surface p-3">
                  <DataTable
                    caption="Projetos: progresso e atrasos"
                    columns={[
                      'Projeto',
                      'Situação',
                      'Tarefas concluídas',
                      'Atrasadas',
                      'Marcos',
                      'Marcos atrasados',
                    ]}
                    rows={d.projects.map((p) => {
                      const r = safeRate(p.tasksDone, p.tasksTotal);
                      return [
                        p.name,
                        STATUS[p.status] ?? p.status,
                        `${String(p.tasksDone)}/${String(p.tasksTotal)} (${formatPercent(r)})`,
                        p.tasksOverdue,
                        `${String(p.milestonesDone)}/${String(p.milestonesTotal)}`,
                        p.milestonesOverdue,
                      ];
                    })}
                  />
                </div>
              )}
              {d.milestones.length > 0 && (
                <>
                  <h3 className="mt-4 mb-2 text-body font-semibold">Marcos com data no período</h3>
                  <ul className="flex flex-col gap-1.5 text-body-sm">
                    {d.milestones.map((m) => {
                      const project = d.projects.find((p) => p.id === m.projectId);
                      const late = m.completedOn ? m.completedOn > m.dueOn : m.dueOn < d.today;
                      return (
                        <li key={m.id}>
                          <Link
                            to={`/projetos/${m.projectId}`}
                            className="font-medium hover:underline"
                          >
                            {m.title}
                          </Link>
                          {project && ` · ${project.name}`} · previsto {dayLabel(m.dueOn)} ·{' '}
                          {m.completedOn
                            ? `concluído ${dayLabel(m.completedOn)}${late ? ' (com atraso)' : ''}`
                            : late
                              ? 'atrasado'
                              : 'pendente'}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
            <HowCalculated>
              <p>
                <strong>Concluídas/criadas/canceladas</strong>: tarefas cujo instante de conclusão,
                criação ou cancelamento cai no período (dia local).
              </p>
              <p>
                <strong>Prazos cumpridos</strong>: concluídas até o dia do prazo ÷ (tarefas com
                prazo no período − canceladas − abertas que ainda não venceram). Sem base, “—”.
              </p>
              <p>
                <strong>Realizado ÷ estimado</strong>: mediana da razão entre o tempo das atividades
                ligadas à tarefa e a estimativa, só para tarefas concluídas no período com
                estimativa e tempo registrado. A mediana não é distorcida por uma tarefa fora da
                curva.
              </p>
              <p>
                <strong>Projetos</strong>: situação atual (não depende do período); tarefas
                canceladas ficam fora do total.
              </p>
            </HowCalculated>
          </>
        );
      }}
    </StatsLoading>
  );
}
