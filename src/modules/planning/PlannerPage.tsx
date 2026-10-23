import { pluralize } from '@/lib/text';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarPlus, Info, Plus, Wand2, X } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { ListSkeleton } from '@/components/ui/QueryState';
import { ErrorState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays, formatDateOnly } from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import { localTimeOf, startOfWeek, zonedToUtc } from '@/lib/zoned';
import { useSubjectsQuery, useTasksQuery } from '@/services/data/queries';
import { mustList } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import { useStats } from '@/modules/analytics/data/stats-api';
import { useCalendarRangeQuery, useCreateBlocks } from '@/modules/calendar/data/calendar-api';
import { expandAgenda } from '@/modules/calendar/logic/agenda';
import { findConflicts } from '@/modules/calendar/logic/conflicts';
import {
  useAvailabilityMutations,
  useAvailabilityQuery,
  usePreferencesQuery,
  useSavePreferences,
} from './data/planning-api';
import {
  buildPlan,
  type Demand,
  type PlanningPreferences,
  type PreferredPeriod,
  type Proposal,
} from './logic/planner';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const PERIODS: Record<PreferredPeriod, string> = {
  any: 'Sem preferência',
  morning: 'Manhã (5h–12h)',
  afternoon: 'Tarde (12h–18h)',
  evening: 'Noite (18h–24h)',
};

/** Tempo realizado por tarefa (atividades ligadas), agregado no banco. */
function useTaskTimeTotals(ids: string[]) {
  const client = useSupabase();
  return useQuery({
    queryKey: ['activities', 'task-totals', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: ({ signal }) =>
      mustList(client.rpc('task_time_totals', { p_task_ids: ids }).abortSignal(signal)),
  });
}

interface Edit {
  selected: boolean;
  time: string;
  minutes: number;
}

export function PlannerPage() {
  const { today, timezone, weekStartsOn, now } = useUserCalendar();
  const [horizon, setHorizon] = useState(7);
  const from = today;
  const to = addDays(today, horizon);
  const ws = zonedToUtc(from, '00:00', timezone).toISOString();
  const we = zonedToUtc(to, '00:00', timezone).toISOString();
  const weekStart = startOfWeek(today, weekStartsOn);
  const weekEnd = addDays(weekStart, 7);

  const windows = useAvailabilityQuery();
  const prefs = usePreferencesQuery();
  const tasks = useTasksQuery();
  const subjects = useSubjectsQuery();
  const calendar = useCalendarRangeQuery(ws, we, from, to);
  const openTasks = (tasks.data ?? []).filter(
    (t) => t.status === 'todo' || t.status === 'in_progress',
  );
  const totals = useTaskTimeTotals(openTasks.filter((t) => t.estimate_minutes).map((t) => t.id));
  const history = useStats('stats_tasks', { from: addDays(today, -89), to: addDays(today, 1) });
  const studyWeek = useStats('stats_study', { from: weekStart, to: weekEnd });

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [confirming, setConfirming] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const create = useCreateBlocks();

  const loading = [windows, prefs, tasks, subjects, calendar, history, studyWeek].some(
    (q) => q.status === 'pending',
  );
  const error = [windows, prefs, tasks, subjects, calendar, history, studyWeek].find(
    (q) => q.error,
  )?.error;

  let content;
  if (loading) content = <ListSkeleton rows={5} />;
  else if (error)
    content = (
      <ErrorState title="Não foi possível montar o plano" description={errorMessage(error)} />
    );
  else {
    const agenda = calendar.data
      ? expandAgenda(calendar.data.events, calendar.data.exceptions, ws, we, timezone)
      : [];
    const future = agenda.filter((s) => Date.parse(s.end) > now.getTime());
    const plannedFor = (pred: (s: (typeof agenda)[number]) => boolean, until?: string) =>
      Math.round(
        future
          .filter((s) => pred(s) && (!until || s.day < until))
          .reduce(
            (sum, s) =>
              sum + (Date.parse(s.end) - Math.max(Date.parse(s.start), now.getTime())) / 60_000,
            0,
          ),
      );
    const actual = new Map((totals.data ?? []).map((r) => [r.task_id, Math.round(r.seconds / 60)]));
    const demands: Demand[] = [
      ...openTasks.map((t): Demand => ({
        kind: 'task',
        id: t.id,
        title: t.title,
        priority: t.priority as 'low' | 'medium' | 'high',
        dueOn: t.due_on,
        createdAt: t.created_at,
        estimateMinutes: t.estimate_minutes ?? 0,
        actualMinutes: actual.get(t.id) ?? 0,
        plannedMinutes: plannedFor((s) => s.taskId === t.id),
      })),
      ...(subjects.data ?? [])
        .filter(
          (s) =>
            s.archived_at === null && s.status === 'active' && (s.target_minutes_per_week ?? 0) > 0,
        )
        .map((s): Demand => ({
          kind: 'study',
          id: s.id,
          title: s.name,
          weeklyTargetMinutes: s.target_minutes_per_week ?? 0,
          doneMinutes: Math.round(
            (studyWeek.data?.bySubject.find((b) => b.subjectId === s.id)?.seconds ?? 0) / 60,
          ),
          plannedMinutes: plannedFor((x) => x.subjectId === s.id, weekEnd),
          untilDay: addDays(weekEnd, -1),
        })),
    ];
    const plan = buildPlan({
      timezone,
      now: now.toISOString(),
      from,
      to,
      windows: (windows.data ?? []).map((w) => ({
        weekday: w.weekday,
        start: w.start_time,
        end: w.end_time,
      })),
      busy: agenda.map((s) => ({ id: s.id, title: s.title, start: s.start, end: s.end })),
      preferences: prefs.data ?? {
        breakMinutes: 10,
        minBlockMinutes: 25,
        maxBlockMinutes: 90,
        preferredPeriod: 'any',
        dailyLoadLimitMinutes: 480,
      },
      demands,
      estimateHistory: (history.data?.estimates ?? [])
        .filter((e) => e.estimateMinutes > 0 && e.actualSeconds > 0)
        .map((e) => e.actualSeconds / 60 / e.estimateMinutes),
    });

    const effective = (p: Proposal): Proposal & Edit => {
      const e = edits[p.id];
      const time = e?.time ?? localTimeOf(p.start, timezone);
      const minutes = e?.minutes ?? p.minutes;
      const start = zonedToUtc(p.day, time, timezone).toISOString();
      return {
        ...p,
        selected: e?.selected ?? true,
        time,
        minutes,
        start,
        end: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
      };
    };
    const items = plan.proposals.map(effective);
    const chosen = items.filter((i) => i.selected && i.minutes > 0);
    const conflicts = findConflicts([
      ...agenda,
      ...chosen.map((c) => ({
        id: c.id,
        title: c.title,
        start: c.start,
        end: c.end,
        kind: 'block' as const,
      })),
    ]).filter((c) => chosen.some((x) => x.id === c.a.id || x.id === c.b.id));
    const conflicted = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));
    const existingConflicts = findConflicts(agenda);
    const days = [...new Set(items.map((i) => i.day))].sort();
    const setEdit = (id: string, patch: Partial<Edit>, base: Proposal & Edit) => {
      setEdits((prev) => ({
        ...prev,
        [id]: {
          selected: base.selected,
          time: base.time,
          minutes: base.minutes,
          ...prev[id],
          ...patch,
        },
      }));
    };

    const noWindows = (windows.data ?? []).length === 0;
    const waiting = plan.unplaced.length;
    content = (
      <div className="flex flex-col gap-4">
        {noWindows && (
          <Notice tone="warning" title="Defina sua disponibilidade">
            Sem janelas de disponibilidade não há onde propor blocos. Adicione-as em
            “Disponibilidade” abaixo.
          </Notice>
        )}
        {plan.notes.map((n) => (
          <p key={n} className="flex gap-2 text-body-sm text-fg-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {n}
          </p>
        ))}
        {existingConflicts.length > 0 && (
          <Notice tone="warning" title="A agenda já tem conflitos">
            {existingConflicts.length} sobreposição(ões) entre compromissos/blocos existentes. O
            plano não altera nada existente —{' '}
            <Link to="/calendario" className="font-medium underline">
              resolva no calendário
            </Link>
            .
          </Notice>
        )}
        {discarded ? (
          <Card aria-labelledby="plan-discarded">
            <CardBody className="pt-5">
              <p id="plan-discarded" className="text-body-sm">
                Plano descartado. Nada foi criado.
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => {
                  setEdits({});
                  setDiscarded(false);
                }}
              >
                Gerar sugestão de novo
              </Button>
            </CardBody>
          </Card>
        ) : items.length === 0 ? (
          <Card aria-labelledby="plan-empty">
            <CardBody className="pt-5">
              <p id="plan-empty" className="text-body-sm text-fg-muted">
                {waiting === 0
                  ? 'Nada a propor: não há tarefas abertas com estimativa nem matérias com meta semanal pendente.'
                  : noWindows
                    ? `Nada a propor ainda: ${pluralize(waiting, 'item espera', 'itens esperam')} horário, mas não há janelas de disponibilidade.`
                    : `Nenhum item coube nas suas janelas — veja “Sem horário disponível”.`}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card aria-labelledby="plan-title">
            <CardHeader
              title={`Sugestão: ${String(items.length)} bloco(s)`}
              titleId="plan-title"
              description="Revise, ajuste horários ou desmarque o que não quiser. Nada é salvo até você confirmar."
            />
            <CardBody className="flex flex-col gap-4">
              {days.map((day) => (
                <section key={day} aria-label={formatDateOnly(day)}>
                  <h3 className="mb-2 text-body-sm font-semibold">{formatDateOnly(day)}</h3>
                  <ul className="flex flex-col gap-2">
                    {items
                      .filter((i) => i.day === day)
                      .map((i) => (
                        <li
                          key={i.id}
                          className="rounded-md border border-border p-3"
                          aria-label={`${i.title} às ${i.time}`}
                        >
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="flex min-h-10 items-center gap-2 text-body-sm font-medium">
                              <input
                                type="checkbox"
                                className="size-4 accent-[var(--lo-primary)]"
                                checked={i.selected}
                                onChange={(e) => {
                                  setEdit(i.id, { selected: e.target.checked }, i);
                                }}
                              />
                              {i.kind === 'task' ? 'Tarefa' : 'Estudo'}: {i.title}
                            </label>
                            <TextField
                              label="Início"
                              type="time"
                              className="w-32"
                              value={i.time}
                              onChange={(e) => {
                                if (e.target.value) setEdit(i.id, { time: e.target.value }, i);
                              }}
                            />
                            <TextField
                              label="Minutos"
                              type="number"
                              min={5}
                              max={480}
                              step={5}
                              className="w-28"
                              value={String(i.minutes)}
                              onChange={(e) => {
                                setEdit(
                                  i.id,
                                  {
                                    minutes: Math.max(
                                      0,
                                      Math.min(480, Number(e.target.value) || 0),
                                    ),
                                  },
                                  i,
                                );
                              }}
                            />
                            {conflicted.has(i.id) && i.selected && (
                              <Badge tone="danger">
                                <AlertTriangle aria-hidden="true" className="size-3" />
                                Conflita com outro item
                              </Badge>
                            )}
                          </div>
                          <details className="mt-2 text-caption text-fg-muted">
                            <summary className="cursor-pointer font-medium text-primary">
                              Por que este horário?
                            </summary>
                            <ul className="mt-1 list-disc pl-5">
                              {i.reasons.map((r) => (
                                <li key={r}>{r}</li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDiscarded(true);
                  }}
                >
                  Descartar plano
                </Button>
                <Button
                  icon={<CalendarPlus className="size-4" />}
                  disabled={chosen.length === 0 || create.isPending}
                  onClick={() => {
                    setConfirming(true);
                  }}
                >
                  Criar {String(chosen.length)} bloco(s)
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
        {plan.unplaced.length > 0 && (
          <Card aria-labelledby="plan-unplaced">
            <CardHeader title="Sem horário disponível" titleId="plan-unplaced" />
            <CardBody>
              <ul className="flex flex-col gap-3 text-body-sm">
                {noWindows && (
                  <li className="text-fg-muted">
                    Motivo comum: nenhuma janela de disponibilidade cadastrada. Adicione janelas
                    para que estes itens recebam horários.
                  </li>
                )}
                {plan.unplaced.map((u) =>
                  noWindows ? (
                    // Uma causa só para todos: não repetir a mesma explicação item a item.
                    <li key={u.demandId}>
                      <p className="font-medium">
                        {u.title}: faltam {String(u.minutes)} min
                      </p>
                    </li>
                  ) : (
                    <li key={u.demandId}>
                      <p className="font-medium">
                        {u.title}: faltam {String(u.minutes)} min
                      </p>
                      <p className="text-fg-muted">{u.reason}</p>
                      <p className="text-caption text-fg-subtle">
                        Alternativas: {u.alternatives.join(' ')}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            </CardBody>
          </Card>
        )}
        {plan.skipped.length > 0 && (
          <details className="text-body-sm text-fg-muted">
            <summary className="cursor-pointer font-medium text-fg">
              {String(plan.skipped.length)} item(ns) fora do plano
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {plan.skipped.map((s) => (
                <li key={s.demandId}>
                  {s.title}: {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        <ConfirmDialog
          open={confirming}
          tone="primary"
          title={`Criar ${String(chosen.length)} bloco(s) no calendário?`}
          confirmLabel="Criar blocos"
          pending={create.isPending}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            create.mutate(
              chosen.map((c) => ({
                title: c.title,
                description: `Bloco criado pelo planejamento. ${c.reasons[0] ?? ''}`.trim(),
                kind: c.kind === 'task' ? 'task' : 'study',
                all_day: false,
                starts_at: c.start,
                ends_at: c.end,
                start_date: null,
                end_date: null,
                timezone,
                task_id: c.kind === 'task' ? c.demandId : null,
                subject_id: c.kind === 'study' ? c.demandId : null,
              })),
              {
                onSuccess: () => {
                  setEdits({});
                },
                onSettled: () => {
                  setConfirming(false);
                },
              },
            );
          }}
        >
          {conflicts.length > 0
            ? `Atenção: ${String(conflicts.length)} conflito(s) com outros itens. `
            : ''}
          Os blocos reservam tempo; nenhuma tarefa é concluída e nada existente é alterado. Você
          pode mover ou excluir cada bloco depois, no calendário.
        </ConfirmDialog>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Wand2 aria-hidden="true" className="size-4" />
            Planejar
          </span>
        }
        title="Planejar a semana"
        description="Sugestão de blocos a partir da sua disponibilidade, compromissos, prazos, prioridades e estimativas — explicada item a item."
        actions={
          <Link to="/calendario" className={buttonClasses('secondary', 'md')}>
            Voltar ao calendário
          </Link>
        }
      />
      <div className="mb-4 max-w-xs">
        <SelectField
          label="Planejar os próximos"
          value={String(horizon)}
          onChange={(e) => {
            setHorizon(Number(e.target.value));
            setEdits({});
          }}
        >
          <option value="3">3 dias</option>
          <option value="7">7 dias</option>
          <option value="14">14 dias</option>
        </SelectField>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div>{content}</div>
        <aside className="flex flex-col gap-4">
          <AvailabilityEditor />
          {prefs.data && <PreferencesForm key={JSON.stringify(prefs.data)} initial={prefs.data} />}
        </aside>
      </div>
    </div>
  );
}

function AvailabilityEditor() {
  const windows = useAvailabilityQuery();
  const { add, remove } = useAvailabilityMutations();
  const [weekday, setWeekday] = useState('1');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('12:00');
  const invalid = !start || !end || end <= start;
  return (
    <Card aria-labelledby="avail-title">
      <CardHeader
        title="Disponibilidade"
        titleId="avail-title"
        description="Quando você pode receber blocos"
      />
      <CardBody className="flex flex-col gap-3">
        {(windows.data ?? []).length === 0 ? (
          <p className="text-body-sm text-fg-subtle">Nenhuma janela ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body-sm">
            {(windows.data ?? []).map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2">
                <span>
                  {WEEKDAYS[w.weekday]} · {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remover ${WEEKDAYS[w.weekday] ?? ''} ${w.start_time.slice(0, 5)}`}
                  icon={<X className="size-4" />}
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(w.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid)
              add.mutate({ weekday: Number(weekday), start_time: start, end_time: end });
          }}
        >
          <div className="col-span-2">
            <SelectField
              label="Dia"

              value={weekday}
              onChange={(e) => {
                setWeekday(e.target.value);
              }}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={String(i)}>
                  {d}
                </option>
              ))}
            </SelectField>
          </div>
          <TextField
            label="De"
            type="time"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
            }}
          />
          <TextField
            label="Até"
            type="time"
            value={end}
            error={invalid ? 'Fim depois do início.' : undefined}
            onChange={(e) => {
              setEnd(e.target.value);
            }}
          />
          <Button
            type="submit"
            variant="secondary"
            className="col-span-2"
            icon={<Plus className="size-4" />}
            disabled={invalid || add.isPending}
          >
            Adicionar janela
          </Button>
        </form>
        <p className="text-caption text-fg-subtle">Janelas do mesmo dia não podem se sobrepor.</p>
      </CardBody>
    </Card>
  );
}

function PreferencesForm({ initial }: { initial: PlanningPreferences }) {
  const save = useSavePreferences();
  const [p, setP] = useState(initial);
  const invalid = p.maxBlockMinutes < p.minBlockMinutes;
  const num = (key: keyof PlanningPreferences, min: number, max: number) => ({
    type: 'number' as const,
    min,
    max,
    value: String(p[key]),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setP({ ...p, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) });
    },
  });
  return (
    <Card aria-labelledby="prefs-title">
      <CardHeader title="Preferências" titleId="prefs-title" />
      <CardBody>
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) save.mutate(p);
          }}
        >
          <TextField label="Bloco mínimo (min)" {...num('minBlockMinutes', 10, 240)} />
          <TextField
            label="Bloco máximo (min)"
            {...num('maxBlockMinutes', 15, 480)}
            error={invalid ? 'Menor que o mínimo.' : undefined}
          />
          <TextField label="Descanso (min)" {...num('breakMinutes', 0, 120)} />
          <TextField label="Limite diário (min)" {...num('dailyLoadLimitMinutes', 60, 1440)} />
          <div className="col-span-2">
            <SelectField
              label="Período preferido"

              value={p.preferredPeriod}
              onChange={(e) => {
                setP({ ...p, preferredPeriod: e.target.value as PreferredPeriod });
              }}
            >
              {Object.entries(PERIODS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            type="submit"
            variant="secondary"
            className="col-span-2"
            disabled={invalid || save.isPending}
          >
            Salvar preferências
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
