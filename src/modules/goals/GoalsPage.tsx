import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Flag,
  Pencil,
  Plus,
  Target,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ListSkeleton } from '@/components/ui/QueryState';
import { FilterSelect } from '@/components/ui/SearchField';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays, formatDateOnly, localDateIn, type ISODate } from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import {
  useCategoriesQuery,
  useGoalProgressQuery,
  useGoalsQuery,
  useHabitsQuery,
  useProjectsQuery,
  useSubjectsQuery,
} from '@/services/data/queries';
import { GoalForm } from './components/GoalForm';
import {
  useDeleteGoal,
  useGoalDetailQuery,
  useGoalEntries,
  useGoalMilestones,
  useGoalStatus,
} from './data/goal-api';
import {
  formatGoalValue,
  goalRatio,
  MODE_LABELS,
  PERIOD_LABELS,
  type Goal,
  type GoalMode,
  type GoalPeriod,
} from './logic/goals';

type Scope = 'active' | 'achieved' | 'abandoned' | 'archived';

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  achieved: 'Alcançada',
  abandoned: 'Abandonada',
};

function cycleLabel(period: GoalPeriod, start: ISODate, end: ISODate): string {
  if (period === 'once') return `${formatDateOnly(start)} → ${formatDateOnly(addDays(end, -1))}`;
  if (period === 'daily') return 'Hoje';
  return `${formatDateOnly(start)} – ${formatDateOnly(addDays(end, -1))}`;
}

export function GoalsPage() {
  const { today, timezone } = useUserCalendar();
  const goalsQuery = useGoalsQuery();
  const progressQuery = useGoalProgressQuery();
  const subjects = useSubjectsQuery().data ?? [];
  const categories = useCategoriesQuery().data ?? [];
  const projects = useProjectsQuery().data ?? [];
  const habits = useHabitsQuery().data ?? [];
  const [scope, setScope] = useState<Scope>('active');
  const [dialog, setDialog] = useState<
    null | { mode: 'create' } | { mode: 'view'; id: string } | { mode: 'edit'; id: string }
  >(null);
  const goals = goalsQuery.data ?? [];
  const progress = new Map((progressQuery.data ?? []).map((p) => [p.goal_id, p]));
  const current =
    dialog && dialog.mode !== 'create' ? goals.find((g) => g.id === dialog.id) : undefined;
  const visible = goals.filter((g) =>
    scope === 'archived' ? g.archived_at !== null : g.archived_at === null && g.status === scope,
  );
  const formProps = { today, subjects, categories, projects, habits };

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Target aria-hidden="true" className="size-4" />
            Planejar
          </span>
        }
        title="Metas"
        description="Alvos mensuráveis por dia, semana, mês ou até um prazo — com progresso calculado dos seus registros."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setDialog({ mode: 'create' });
            }}
          >
            Nova meta
          </Button>
        }
      />
      <FilterSelect
        className="mb-4 w-56"
        label="Mostrar"
        value={scope}
        onChange={(v) => {
          setScope(v as Scope);
        }}
        options={[
          { value: 'active', label: 'Ativas' },
          { value: 'achieved', label: 'Alcançadas' },
          { value: 'abandoned', label: 'Abandonadas' },
          { value: 'archived', label: 'Arquivadas' },
        ]}
      />
      {goalsQuery.status === 'pending' ? (
        <ListSkeleton rows={4} />
      ) : goalsQuery.status === 'error' ? (
        <ErrorState
          title="Não foi possível carregar as metas"
          description={errorMessage(goalsQuery.error)}
          onRetry={() => {
            void goalsQuery.refetch();
          }}
        />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target className="size-6" />}
          title="Nenhuma meta ainda"
          description="Crie metas de horas de estudo, sessões, questões, páginas, tarefas, hábitos ou valores manuais."
          action={
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDialog({ mode: 'create' });
              }}
            >
              Nova meta
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState compact title="Nenhuma meta neste filtro" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((g) => {
            const p = progress.get(g.id);
            const mode = g.progress_mode as GoalMode;
            const ratio = p ? goalRatio(p.current_value, p.target_value) : null;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDialog({ mode: 'view', id: g.id });
                  }}
                  className="flex h-full w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-elev-1 hover:border-border-strong"
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <h2 className="min-w-0 font-semibold">{g.title}</h2>
                    {mode === 'manual' ? (
                      <Badge tone="warning">Manual</Badge>
                    ) : (
                      <Badge tone="info">Automática</Badge>
                    )}
                  </div>
                  <p className="text-caption text-fg-subtle">
                    {MODE_LABELS[mode].label} · {PERIOD_LABELS[g.period as GoalPeriod]}
                    {g.due_on && ` · prazo ${formatDateOnly(g.due_on)}`}
                  </p>
                  {p ? (
                    <div className="mt-auto flex w-full flex-col gap-1.5">
                      <div className="flex justify-between text-body-sm">
                        <span className="font-medium tabular">
                          {formatGoalValue(p.current_value, g.unit)} de{' '}
                          {formatGoalValue(p.target_value, g.unit)}
                        </span>
                        <span className="tabular text-fg-subtle">
                          {Math.round((ratio ?? 0) * 100)}%
                        </span>
                      </div>
                      <ProgressBar
                        value={p.current_value}
                        max={p.target_value}
                        label={`Progresso de ${g.title}`}
                        valueText={`${formatGoalValue(p.current_value, g.unit)} de ${formatGoalValue(p.target_value, g.unit)}`}
                      />
                      <p className="text-caption text-fg-subtle">
                        Ciclo: {cycleLabel(g.period as GoalPeriod, p.cycle_start, p.cycle_end)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-auto text-caption text-fg-subtle">
                      {g.status === 'active' && g.archived_at === null
                        ? 'Calculando…'
                        : STATUS_LABELS[g.status]}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={dialog !== null && (dialog.mode === 'create' || current !== undefined)}
        onClose={() => {
          setDialog(null);
        }}
        title={
          dialog?.mode === 'create'
            ? 'Nova meta'
            : dialog?.mode === 'edit'
              ? 'Editar meta'
              : (current?.title ?? 'Meta')
        }
        size="lg"
      >
        {dialog?.mode === 'create' && (
          <GoalForm
            {...formProps}
            onSaved={(g) => {
              setDialog({ mode: 'view', id: g.id });
            }}
            onCancel={() => {
              setDialog(null);
            }}
          />
        )}
        {dialog?.mode === 'edit' && current && (
          <GoalForm
            {...formProps}
            goal={current}
            onSaved={() => {
              setDialog({ mode: 'view', id: current.id });
            }}
            onCancel={() => {
              setDialog({ mode: 'view', id: current.id });
            }}
          />
        )}
        {dialog?.mode === 'view' && current && (
          <GoalDetail
            goal={current}
            today={today}
            timezone={timezone}
            onEdit={() => {
              setDialog({ mode: 'edit', id: current.id });
            }}
            onDeleted={() => {
              setDialog(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function GoalDetail({
  goal,
  today,
  timezone,
  onEdit,
  onDeleted,
}: {
  goal: Goal;
  today: ISODate;
  timezone: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const detail = useGoalDetailQuery(goal.id);
  const status = useGoalStatus();
  const remove = useDeleteGoal();
  const entries = useGoalEntries();
  const milestones = useGoalMilestones();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(today);
  const [entryNote, setEntryNote] = useState('');
  const [milestone, setMilestone] = useState('');
  const mode = goal.progress_mode as GoalMode;
  const manual = mode === 'manual';
  const parsedAmount = Number(amount.replace(',', '.'));
  const dateFmt = (iso: string) => formatDateOnly(localDateIn(new Date(iso), timezone));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={manual ? 'warning' : 'info'}>{manual ? 'Manual' : 'Automática'}</Badge>
        <Badge>{MODE_LABELS[mode].label}</Badge>
        <Badge>{PERIOD_LABELS[goal.period as GoalPeriod]}</Badge>
        <Badge>{STATUS_LABELS[goal.status]}</Badge>
        {goal.archived_at && <Badge tone="warning">Arquivada</Badge>}
      </div>
      {goal.description && <p className="whitespace-pre-wrap">{goal.description}</p>}
      <p className="text-body-sm text-fg-muted">
        Alvo: {formatGoalValue(goal.target_value, goal.unit)} · fonte:{' '}
        {MODE_LABELS[mode].source.toLowerCase()} · desde {formatDateOnly(goal.start_on)}
        {goal.due_on && ` · prazo ${formatDateOnly(goal.due_on)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={onEdit}>
          Editar
        </Button>
        {goal.status === 'active' ? (
          <>
            <Button
              variant="secondary"
              icon={<CheckCircle2 className="size-4" />}
              disabled={status.isPending}
              onClick={() => {
                status.mutate({ id: goal.id, patch: { status: 'achieved' } });
              }}
            >
              Marcar como alcançada
            </Button>
            <Button
              variant="ghost"
              icon={<XCircle className="size-4" />}
              disabled={status.isPending}
              onClick={() => {
                status.mutate({ id: goal.id, patch: { status: 'abandoned' } });
              }}
            >
              Abandonar
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={status.isPending}
            onClick={() => {
              status.mutate({ id: goal.id, patch: { status: 'active' } });
            }}
          >
            Reativar
          </Button>
        )}
        <Button
          variant="ghost"
          icon={
            goal.archived_at ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )
          }
          disabled={status.isPending}
          onClick={() => {
            status.mutate({
              id: goal.id,
              patch: { archived_at: goal.archived_at ? null : new Date().toISOString() },
            });
          }}
        >
          {goal.archived_at ? 'Restaurar' : 'Arquivar'}
        </Button>
        <Button
          variant="ghost"
          icon={<Trash2 className="size-4" />}
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          Excluir
        </Button>
      </div>

      {detail.status === 'pending' ? (
        <ListSkeleton rows={3} />
      ) : detail.status === 'error' ? (
        <ErrorState
          description={errorMessage(detail.error)}
          onRetry={() => {
            void detail.refetch();
          }}
        />
      ) : (
        <>
          <section aria-labelledby="goal-history">
            <h3 id="goal-history" className="mb-2 text-body-sm font-semibold">
              {goal.period === 'once' ? 'Evolução por semana' : 'Últimos ciclos'}
            </h3>
            <table className="w-full text-body-sm">
              <caption className="sr-only">Valor de cada ciclo</caption>
              <thead>
                <tr className="text-left text-caption text-fg-subtle">
                  <th scope="col" className="py-1 font-medium">
                    Ciclo
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Valor
                  </th>
                  {goal.period !== 'once' && (
                    <th scope="col" className="py-1 text-right font-medium">
                      Alvo
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {detail.data.history.map((h) => (
                  <tr key={h.cycle_start} className="border-t border-border">
                    <td className="py-1.5">
                      {cycleLabel(
                        goal.period === 'once' ? 'weekly' : (goal.period as GoalPeriod),
                        h.cycle_start,
                        h.cycle_end,
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular">
                      {formatGoalValue(h.value, goal.unit)}
                    </td>
                    {goal.period !== 'once' && (
                      <td className="py-1.5 text-right tabular">
                        {h.value >= goal.target_value
                          ? '✓ atingido'
                          : `${String(Math.round(goalRatio(h.value, goal.target_value) * 100))}%`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {manual && (
            <section aria-labelledby="goal-entries">
              <h3 id="goal-entries" className="mb-2 text-body-sm font-semibold">
                Lançamentos
              </h3>
              <form
                className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!Number.isFinite(parsedAmount) || parsedAmount === 0) return;
                  entries.add.mutate(
                    {
                      goal_id: goal.id,
                      amount: parsedAmount,
                      recorded_on: entryDate,
                      note: entryNote.trim(),
                    },
                    {
                      onSuccess: () => {
                        setAmount('');
                        setEntryNote('');
                      },
                    },
                  );
                }}
              >
                <TextField
                  label={`Quantidade (${goal.unit})`}
                  inputMode="decimal"
                  hint="Negativo corrige."
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                  }}
                />
                <TextField
                  label="Data"
                  type="date"
                  max={today}
                  value={entryDate}
                  onChange={(e) => {
                    setEntryDate(e.target.value);
                  }}
                />
                <TextField
                  label="Nota"
                  maxLength={500}
                  value={entryNote}
                  onChange={(e) => {
                    setEntryNote(e.target.value);
                  }}
                />
                <Button
                  type="submit"
                  disabled={
                    !Number.isFinite(parsedAmount) ||
                    parsedAmount === 0 ||
                    amount.trim() === '' ||
                    entries.add.isPending
                  }
                >
                  Lançar
                </Button>
              </form>
              {detail.data.entries.length === 0 ? (
                <p className="text-body-sm text-fg-subtle">Nenhum lançamento.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-body-sm">
                  {detail.data.entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="w-16 tabular text-fg-subtle">
                        {formatDateOnly(e.recorded_on)}
                      </span>
                      <span className="font-medium tabular">
                        {e.amount > 0 ? '+' : ''}
                        {formatGoalValue(e.amount, goal.unit)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg-muted">{e.note}</span>
                      <button
                        type="button"
                        aria-label={`Remover lançamento de ${formatDateOnly(e.recorded_on)}`}
                        onClick={() => {
                          entries.remove.mutate(e.id);
                        }}
                        className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="goal-milestones">
            <h3
              id="goal-milestones"
              className="mb-2 flex items-center gap-2 text-body-sm font-semibold"
            >
              <Flag aria-hidden="true" className="size-4" />
              Marcos
            </h3>
            {detail.data.milestones.length > 0 && (
              <ul className="mb-2 flex flex-col gap-1">
                {detail.data.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-body-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--lo-primary)]"
                      checked={m.achieved_at !== null}
                      aria-label={`Marco ${m.title} atingido`}
                      onChange={() => {
                        milestones.toggle.mutate({ id: m.id, achieved: m.achieved_at === null });
                      }}
                    />
                    <span className="min-w-0 flex-1">{m.title}</span>
                    <button
                      type="button"
                      aria-label={`Excluir marco ${m.title}`}
                      onClick={() => {
                        milestones.remove.mutate(m.id);
                      }}
                      className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!milestone.trim()) return;
                milestones.add.mutate(
                  {
                    goal_id: goal.id,
                    title: milestone.trim(),
                    target_value: null,
                    due_on: null,
                    sort_order: detail.data.milestones.length,
                  },
                  {
                    onSuccess: () => {
                      setMilestone('');
                    },
                  },
                );
              }}
            >
              <label htmlFor={`goal-ms-${goal.id}`} className="sr-only">
                Novo marco
              </label>
              <input
                id={`goal-ms-${goal.id}`}
                value={milestone}
                maxLength={200}
                placeholder="Novo marco"
                onChange={(e) => {
                  setMilestone(e.target.value);
                }}
                className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
              />
              <Button size="sm" variant="secondary" type="submit" disabled={!milestone.trim()}>
                Adicionar
              </Button>
            </form>
          </section>

          {detail.data.changes.length > 0 && (
            <section aria-labelledby="goal-changes">
              <h3 id="goal-changes" className="mb-2 text-body-sm font-semibold">
                Alterações
              </h3>
              <ul className="flex flex-col gap-1 text-caption text-fg-muted">
                {detail.data.changes.map((c) => (
                  <li key={c.id}>
                    {dateFmt(c.changed_at)}:{' '}
                    {[
                      c.old_target !== c.new_target &&
                        `alvo ${String(c.old_target)} → ${String(c.new_target)}`,
                      c.old_period !== c.new_period &&
                        `ciclo ${PERIOD_LABELS[c.old_period as GoalPeriod]} → ${PERIOD_LABELS[c.new_period as GoalPeriod]}`,
                      c.old_mode !== c.new_mode &&
                        `tipo ${MODE_LABELS[c.old_mode as GoalMode].label} → ${MODE_LABELS[c.new_mode as GoalMode].label}`,
                      c.old_status !== c.new_status &&
                        `status ${STATUS_LABELS[c.old_status ?? ''] ?? ''} → ${STATUS_LABELS[c.new_status ?? ''] ?? ''}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir meta?"
        confirmLabel="Excluir meta"
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          remove.mutate(goal.id, {
            onSuccess: onDeleted,
            onSettled: () => {
              setConfirmDelete(false);
            },
          });
        }}
      >
        Saem junto os lançamentos, marcos e o histórico de alterações. Os registros que alimentam a
        meta (atividades, sessões, tarefas, hábitos) não são afetados. Para guardar, prefira
        arquivar.
      </ConfirmDialog>
    </div>
  );
}
