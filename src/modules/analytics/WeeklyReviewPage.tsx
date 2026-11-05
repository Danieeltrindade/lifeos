import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays } from '@/lib/date';
import { downloadFile, toCsv } from '@/lib/export';
import { startOfWeek, zonedToUtc } from '@/lib/zoned';
import {
  useActivitiesQuery,
  useCheckinsQuery,
  useHabitsQuery,
  useTasksQuery,
} from '@/services/data/queries';
import { useCalendarRangeQuery } from '@/modules/calendar/data/calendar-api';
import { expandAgenda } from '@/modules/calendar/logic/agenda';
import { toCheckins, toRule } from '@/modules/habits/data/habit-api';
import { formatGoalValue } from '@/modules/goals/logic/goals';
import {
  OPEN_STATUSES,
  useRecommendationsQuery,
  type RecStatus,
} from '@/modules/recommendations/data/recommendations-api';
import { BarSeriesChart, ChartCard, DataTable } from './components/charts';
import { SERIES_PREVIOUS, SERIES_PRIMARY } from './components/chart-colors';
import { ProgressRing } from './components/visuals';
import { WeeklyHistoryCard } from './components/WeeklyHistoryCard';
import { ChartsGrid, StatsGrid, StatsLoading } from './components/common';
import { dayLabel, axisMinutes } from './components/format';
import { useStats } from './data/stats-api';
import { useSaveWeeklyReview, useWeeklyReviewQuery } from './data/weekly-review-api';
import { consistencyInRange } from './logic/habit-stats';
import { formatPercent, formatSeconds } from './logic/metrics';
import { weeklySummary, weeklySummaryRows, type WeeklySummary } from './logic/weekly';

const fmtMin = (m: number) => formatSeconds(m * 60);

export function WeeklyReviewPage() {
  const { today, timezone, weekStartsOn } = useUserCalendar();
  const [params, setParams] = useSearchParams();
  const raw = params.get('semana');
  const weekStart = startOfWeek(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today, weekStartsOn);
  const weekEnd = addDays(weekStart, 7);
  const range = { from: weekStart, to: weekEnd };
  const ws = zonedToUtc(weekStart, '00:00', timezone).toISOString();
  const we = zonedToUtc(weekEnd, '00:00', timezone).toISOString();

  const study = useStats('stats_study', range);
  const acts = useStats('stats_activities', range);
  const tasks = useStats('stats_tasks', range);
  const goals = useStats('stats_goals', range);
  const calendar = useCalendarRangeQuery(ws, we, weekStart, weekEnd);
  const activities = useActivitiesQuery(ws, we);
  const habits = useHabitsQuery();
  const checkins = useCheckinsQuery(weekStart);
  const recs = useRecommendationsQuery();

  const go = (date: string) => {
    setParams(
      (p) => {
        p.set('semana', date);
        return p;
      },
      { replace: true },
    );
  };

  const queries = [study, acts, tasks, goals, calendar, activities];
  const status = queries.some((q) => q.status === 'error')
    ? 'error'
    : queries.every((q) => q.status === 'success')
      ? 'success'
      : 'pending';
  const firstError = queries.find((q) => q.error)?.error;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Semana anterior"
          icon={<ChevronLeft className="size-4" />}
          onClick={() => {
            go(addDays(weekStart, -7));
          }}
        />
        <p className="font-semibold" aria-live="polite">
          Semana de {dayLabel(weekStart)} a {dayLabel(addDays(weekStart, 6))}/
          {weekStart.slice(0, 4)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Próxima semana"
          icon={<ChevronRight className="size-4" />}
          onClick={() => {
            go(addDays(weekStart, 7));
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            go(startOfWeek(today, weekStartsOn));
          }}
        >
          Esta semana
        </Button>
        {weekStart <= today && today < weekEnd && <Badge tone="info">Em andamento</Badge>}
      </div>
      <StatsLoading
        status={status}
        error={firstError}
        retry={() => {
          for (const q of queries) void q.refetch();
        }}
      >
        {() => {
          if (!study.data || !acts.data || !tasks.data || !goals.data || !calendar.data)
            return null;
          const summary = weeklySummary({
            weekStart,
            agenda: expandAgenda(calendar.data.events, calendar.data.exceptions, ws, we, timezone),
            activities: activities.data ?? [],
            study: study.data,
            activityStats: acts.data,
            tasks: tasks.data,
            goals: goals.data,
            habits: (habits.data ?? [])
              .filter((h) => h.archived_at === null && h.start_on < weekEnd)
              .map((h) => ({
                name: h.name,
                consistency: consistencyInRange(
                  toRule(h),
                  toCheckins(checkins.data ?? [], h.id),
                  weekStart,
                  weekEnd,
                  today,
                  weekStartsOn,
                ),
              })),
          });
          const openRecs = (recs.data ?? []).filter((r) =>
            OPEN_STATUSES.includes(r.status as RecStatus),
          );
          return (
            <>
              <WeeklyFacts summary={summary} today={today} />
              <WeeklyHistoryCard weekStart={weekStart} />
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card aria-labelledby="wk-recs">
                  <CardHeader title="Recomendações em aberto" titleId="wk-recs" />
                  <CardBody>
                    {openRecs.length === 0 ? (
                      <p className="text-body-sm text-fg-subtle">Nenhuma recomendação em aberto.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5 text-body-sm">
                        {openRecs.slice(0, 6).map((r) => (
                          <li key={r.id}>{r.title}</li>
                        ))}
                      </ul>
                    )}
                    <Link
                      to="/recomendacoes"
                      className="mt-3 inline-block text-body-sm font-medium text-primary hover:underline"
                    >
                      Abrir recomendações
                    </Link>
                  </CardBody>
                </Card>
                <ReviewForm key={weekStart} weekStart={weekStart} />
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon={<Download className="size-4" />}
                  onClick={() => {
                    downloadFile(
                      toCsv(['Métrica', 'Valor', 'Unidade'], weeklySummaryRows(summary)),
                      `lifeos-semana-${weekStart}.csv`,
                      'text/csv;charset=utf-8',
                    );
                  }}
                >
                  Baixar resumo (CSV)
                </Button>
                <Button
                  variant="ghost"
                  icon={<Download className="size-4" />}
                  onClick={() => {
                    downloadFile(
                      JSON.stringify(
                        { format: 'lifeos-weekly-summary', version: 1, ...summary },
                        null,
                        2,
                      ),
                      `lifeos-semana-${weekStart}.json`,
                      'application/json',
                    );
                  }}
                >
                  Baixar resumo (JSON)
                </Button>
              </div>
            </>
          );
        }}
      </StatsLoading>
    </div>
  );
}

function WeeklyFacts({ summary: s, today }: { summary: WeeklySummary; today: string }) {
  const habitsMet = s.habits.reduce((a, h) => a + h.met, 0);
  const habitsEligible = s.habits.reduce((a, h) => a + h.eligible, 0);
  const habitsRate = habitsEligible > 0 ? habitsMet / habitsEligible : null;
  const tasksRate = s.tasks.dueTotal > 0 ? s.tasks.doneOnTime / s.tasks.dueTotal : null;
  return (
    <>
      <StatsGrid>
        <RingTile
          label="Plano cumprido"
          ring={s.planned.blockAdherence}
          // Sem blocos vinculados não há o que medir: "—", não "0%".
          value={
            s.planned.linkedBlocksMinutes === 0 ? '—' : formatPercent(s.planned.blockAdherence)
          }
          detail={
            s.planned.linkedBlocksMinutes === 0
              ? `${fmtMin(s.planned.blocksMinutes)} em blocos · nenhum ligado a matéria ou tarefa`
              : `${fmtMin(s.planned.realizedInLinkedBlocksMinutes)} de ${fmtMin(s.planned.linkedBlocksMinutes)} nos blocos vinculados`
          }
        />
        <RingTile
          label="Tempo registrado"
          ring={
            s.planned.blocksMinutes > 0
              ? s.executed.activityMinutes / s.planned.blocksMinutes
              : null
          }
          value={fmtMin(s.executed.activityMinutes)}
          detail={`${fmtMin(s.study.minutes)} de estudo · ${String(s.study.sessions)} sessões${
            s.planned.blocksMinutes > 0 ? ` · ${fmtMin(s.planned.blocksMinutes)} planejados` : ''
          }`}
          color="var(--lo-chart-2)"
        />
        <RingTile
          label="Tarefas no prazo"
          ring={tasksRate}
          value={`${String(s.tasks.doneOnTime)} de ${String(s.tasks.dueTotal)}`}
          detail={`${String(s.tasks.completed)} concluídas na semana · ${String(s.tasks.doneLate)} com atraso · ${String(s.tasks.openOverdue)} vencidas abertas`}
          color="var(--lo-chart-3)"
        />
        <RingTile
          label="Hábitos"
          ring={habitsRate}
          value={formatPercent(habitsRate)}
          detail={`${String(habitsMet)} de ${String(habitsEligible)} check-ins esperados`}
          color="var(--lo-chart-4)"
        />
      </StatsGrid>
      <ChartsGrid>
        <ChartCard
          id="chart-week-plan"
          title="Planejado × realizado por dia"
          description={`Blocos planejados (estudo, tarefa, hábito) e tempo de atividades registrado.${
            s.days.some((d) => d.date > today)
              ? ' Dias que ainda não aconteceram mostram só o planejado.'
              : ''
          }`}
          table={
            <DataTable
              caption="Planejado e realizado por dia"
              columns={['Dia', 'Planejado em blocos', 'Registrado']}
              rows={s.days.map((d) => [
                dayLabel(d.date),
                fmtMin(d.plannedBlockMinutes),
                d.date > today ? '— (ainda não aconteceu)' : fmtMin(d.executedMinutes),
              ])}
            />
          }
        >
          <BarSeriesChart
            data={s.days.map((d) => ({
              label: dayLabel(d.date),
              planejado: d.plannedBlockMinutes,
              // Futuro: sem registro possível ainda — ausência, não zero.
              realizado: d.date > today ? null : d.executedMinutes,
            }))}
            series={[
              { key: 'planejado', label: 'Planejado', color: SERIES_PREVIOUS },
              { key: 'realizado', label: 'Registrado', color: SERIES_PRIMARY },
            ]}
            format={fmtMin}
            axisFormat={axisMinutes}
          />
        </ChartCard>
        <Card aria-labelledby="wk-goals">
          <CardHeader title="Metas e hábitos" titleId="wk-goals" />
          <CardBody className="flex flex-col gap-4">
            {s.goals.length === 0 ? (
              <p className="text-body-sm text-fg-subtle">Nenhuma meta nesta semana.</p>
            ) : (
              <DataTable
                caption="Metas na semana"
                columns={['Meta', 'Valor', 'Alvo', 'Situação']}
                rows={s.goals.map((g) => [
                  g.title,
                  formatGoalValue(g.value, g.unit),
                  formatGoalValue(g.target, g.unit),
                  !g.finished ? 'em andamento' : g.met ? 'atingida' : 'não atingida',
                ])}
              />
            )}
            {s.habits.length > 0 && (
              <DataTable
                caption="Hábitos na semana"
                columns={['Hábito', 'Cumpridos', 'Consistência']}
                rows={s.habits.map((h) => [
                  h.name,
                  `${String(h.met)} de ${String(h.eligible)} ${h.unit === 'weeks' ? 'semanas' : 'dias'}`,
                  formatPercent(h.rate),
                ])}
              />
            )}
          </CardBody>
        </Card>
      </ChartsGrid>
      <Card aria-labelledby="wk-issues" className="mt-4">
        <CardHeader title="Conflitos e atrasos" titleId="wk-issues" />
        <CardBody>
          {s.conflicts.length === 0 && s.tasks.openOverdue === 0 && s.tasks.doneLate === 0 ? (
            <p className="text-body-sm text-fg-subtle">
              Nenhum conflito na agenda nem prazo perdido nesta semana.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-body-sm">
              {s.conflicts.map((c, i) => (
                <li key={i}>
                  Conflito em {dayLabel(c.day)}: “{c.a}” e “{c.b}” ({fmtMin(c.minutes)} sobrepostos)
                </li>
              ))}
              {s.tasks.doneLate > 0 && (
                <li>{String(s.tasks.doneLate)} tarefa(s) concluída(s) depois do prazo.</li>
              )}
              {s.tasks.openOverdue > 0 && (
                <li>
                  {String(s.tasks.openOverdue)} tarefa(s) com prazo nesta semana ainda aberta(s).{' '}
                  <Link to="/tarefas" className="font-medium text-primary hover:underline">
                    Ver tarefas
                  </Link>
                </li>
              )}
            </ul>
          )}
          <p className="mt-3 text-caption text-fg-subtle">
            {String(s.study.reviews)} revisões feitas e {String(s.study.postponedReviews)} adiadas
            na semana.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function ReviewForm({ weekStart }: { weekStart: string }) {
  const query = useWeeklyReviewQuery(weekStart);
  if (query.status !== 'success') {
    return (
      <Card aria-labelledby="wk-form">
        <CardHeader title="Anotações e prioridades da próxima semana" titleId="wk-form" />
        <CardBody>
          <p className="text-body-sm text-fg-subtle" role="status">
            {query.status === 'error'
              ? 'Não foi possível carregar a revisão salva.'
              : 'Carregando…'}
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <ReviewFormBody
      weekStart={weekStart}
      saved={query.data.review !== null}
      initialNotes={query.data.review?.notes ?? ''}
      initialItems={query.data.priorities.map((p) => ({ title: p.title, taskId: p.task_id }))}
    />
  );
}

function ReviewFormBody({
  weekStart,
  saved,
  initialNotes,
  initialItems,
}: {
  weekStart: string;
  saved: boolean;
  initialNotes: string;
  initialItems: { title: string; taskId: string | null }[];
}) {
  const save = useSaveWeeklyReview();
  const openTasks = (useTasksQuery().data ?? []).filter(
    (t) => t.status === 'todo' || t.status === 'in_progress',
  );
  const [notes, setNotes] = useState(initialNotes);
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState('');
  const [draftTask, setDraftTask] = useState('');

  const move = (i: number, d: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [it] = next.splice(i, 1);
      if (it) next.splice(i + d, 0, it);
      return next;
    });
  };

  return (
    <Card aria-labelledby="wk-form">
      <CardHeader
        title="Anotações e prioridades da próxima semana"
        titleId="wk-form"
        {...(saved ? { description: 'Revisão salva — edite quando quiser.' } : {})}
      />
      <CardBody>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ weekStart, notes: notes.trim(), priorities: items });
          }}
        >
          <TextareaField
            label="O que funcionou, o que não funcionou, o que mudar"
            rows={4}
            maxLength={10000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-sm font-medium">Prioridades (até 10)</legend>
            {items.length > 0 && (
              <ol className="flex flex-col gap-1.5">
                {items.map((it, i) => (
                  <li
                    key={`${it.title}-${String(i)}`}
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-body-sm"
                  >
                    <span className="w-5 text-fg-subtle">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">
                      {it.title}
                      {it.taskId && (
                        <span className="text-caption text-fg-subtle"> · tarefa vinculada</span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Subir ${it.title}`}
                      disabled={i === 0}
                      icon={<ArrowUp className="size-4" />}
                      onClick={() => {
                        move(i, -1);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Descer ${it.title}`}
                      disabled={i === items.length - 1}
                      icon={<ArrowDown className="size-4" />}
                      onClick={() => {
                        move(i, 1);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remover ${it.title}`}
                      icon={<X className="size-4" />}
                      onClick={() => {
                        setItems((p) => p.filter((_, j) => j !== i));
                      }}
                    />
                  </li>
                ))}
              </ol>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <TextField
                label="Nova prioridade"
                maxLength={200}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                }}
              />
              <SelectField
                label="Vincular a uma tarefa (opcional)"
                value={draftTask}
                onChange={(e) => {
                  setDraftTask(e.target.value);
                  if (!draft.trim())
                    setDraft(openTasks.find((t) => t.id === e.target.value)?.title ?? '');
                }}
              >
                <option value="">Sem tarefa</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </SelectField>
              <Button
                variant="secondary"
                icon={<Plus className="size-4" />}
                disabled={!draft.trim() || items.length >= 10}
                onClick={() => {
                  setItems((p) => [...p, { title: draft.trim(), taskId: draftTask || null }]);
                  setDraft('');
                  setDraftTask('');
                }}
              >
                Adicionar
              </Button>
            </div>
          </fieldset>
          <p className="text-caption text-fg-subtle">
            Salvar não altera tarefas nem a agenda: as prioridades ficam registradas para você
            consultar e planejar.
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar revisão'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Cartão com anel de progresso (0–1; null = sem base). */
function RingTile({
  label,
  value,
  detail,
  ring,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  ring: number | null;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border surface-card p-4 shadow-elev-1 sm:p-5">
      <ProgressRing value={ring} {...(color ? { color } : {})} />
      <div className="min-w-0">
        <p className="text-overline font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          {label}
        </p>
        <p className="mt-1 text-title font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
        <p className="mt-1 text-caption text-fg-muted">{detail}</p>
      </div>
    </div>
  );
}
