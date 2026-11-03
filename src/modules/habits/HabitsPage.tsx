import {
  Check,
  CheckCircle2,
  Circle,
  Flame,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { IconChip } from '@/components/ui/IconChip';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { ListSkeleton } from '@/components/ui/QueryState';
import { FilterSelect } from '@/components/ui/SearchField';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { cn } from '@/lib/cn';
import { addDays, formatDateOnly, type ISODate } from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import { pluralize } from '@/lib/text';
import { dateRange, startOfWeek } from '@/lib/zoned';
import { useCheckinsQuery, useHabitsQuery } from '@/services/data/queries';
import { HabitForm } from './components/HabitForm';
import {
  toCheckins,
  toRule,
  useCheckin,
  useDeleteHabit,
  useSaveHabit,
  type Habit,
  type HabitCheckin,
} from './data/habit-api';
import {
  computeConsistency,
  computeStreak,
  dayState,
  describeSchedule,
  isDueToday,
  isMet,
  weekProgress,
  type DayState,
} from './logic/habits';

/** Janela de histórico lida do banco (sequências mais longas que isso são truncadas). */
const HISTORY_DAYS = 365;

export function HabitsPage() {
  const { today, weekStartsOn } = useUserCalendar();
  const habitsQuery = useHabitsQuery();
  const checkinsQuery = useCheckinsQuery(addDays(today, -HISTORY_DAYS));
  const [scope, setScope] = useState<'active' | 'paused' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const habits = habitsQuery.data ?? [];
  const checkins = checkinsQuery.data ?? [];
  const open = habits.find((h) => h.id === openId);

  const inScope = habits.filter((h) =>
    scope === 'archived' ? h.archived_at !== null : h.archived_at === null && h.status === scope,
  );
  const dueToday = habits.filter(
    (h) =>
      h.archived_at === null &&
      h.status === 'active' &&
      isDueToday(toRule(h), toCheckins(checkins, h.id), today, weekStartsOn),
  );
  const loading = habitsQuery.status === 'pending' || checkinsQuery.status === 'pending';
  const error = habitsQuery.error ?? checkinsQuery.error;

  return (
    <div className="animate-fade-up">
      <PageHeader
        module="habits"
        eyebrow={<span className="inline-flex items-center gap-2">Executar</span>}
        title="Hábitos"
        description="Marque o que fez hoje. Sequências contam só os dias em que o hábito é esperado; a consistência mostra o quadro geral."
        actions={
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => {
              setCreating(true);
            }}
          >
            Novo hábito
          </Button>
        }
      />
      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState
          title="Não foi possível carregar os hábitos"
          description={errorMessage(error)}
          onRetry={() => {
            void habitsQuery.refetch();
            void checkinsQuery.refetch();
          }}
        />
      ) : habits.length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-6" />}
          title="Nenhum hábito ainda"
          description="Crie um hábito com a frequência certa — todo dia, dias específicos ou algumas vezes por semana."
          action={
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setCreating(true);
              }}
            >
              Novo hábito
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Card aria-labelledby="habits-today">
            <CardHeader title="Hoje" titleId="habits-today" description={formatDateOnly(today)} />
            <CardBody>
              {dueToday.length === 0 ? (
                <p className="text-body-sm text-fg-subtle">Nenhum hábito esperado hoje.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {dueToday.map((h) => (
                    <TodayRow
                      key={h.id}
                      habit={h}
                      checkins={checkins}
                      today={today}
                      weekStartsOn={weekStartsOn}
                    />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <section aria-labelledby="habits-all">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 id="habits-all" className="text-title-sm font-semibold">
                Todos os hábitos
              </h2>
              <FilterSelect
                className="w-48"
                label="Mostrar"
                value={scope}
                onChange={(v) => {
                  setScope(v as typeof scope);
                }}
                options={[
                  { value: 'active', label: 'Ativos' },
                  { value: 'paused', label: 'Pausados' },
                  { value: 'archived', label: 'Arquivados' },
                ]}
              />
            </div>
            {inScope.length === 0 ? (
              <EmptyState compact title="Nenhum hábito neste filtro" />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {inScope.map((h) => {
                  const rule = toRule(h);
                  const own = toCheckins(checkins, h.id);
                  const streak = computeStreak(rule, own, today, weekStartsOn);
                  const consistency = computeConsistency(rule, own, today, 30, weekStartsOn);
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(h.id);
                        }}
                        className="surface-card flex w-full flex-col gap-3 rounded-lg border border-border p-4 text-left shadow-elev-1 transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-elev-2"
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <IconChip tone="orange" size="md">
                            <Repeat />
                          </IconChip>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold">{h.name}</h3>
                            <p className="text-caption text-fg-subtle">
                              {describeSchedule(rule)}
                              {h.target_value !== null &&
                                ` · meta ${String(h.target_value).replace('.', ',')} ${h.unit ?? ''}`}
                            </p>
                          </div>
                          <Badge tone={streak.current > 0 ? 'accent' : 'neutral'}>
                            <Flame aria-hidden="true" className="size-3" />
                            {pluralize(
                              streak.current,
                              streak.unit === 'weeks' ? 'semana' : 'dia',
                              streak.unit === 'weeks' ? 'semanas' : 'dias',
                            )}
                          </Badge>
                        </div>
                        <MiniGrid
                          habit={h}
                          checkins={checkins}
                          today={today}
                          weekStartsOn={weekStartsOn}
                          weeks={4}
                        />
                        <p className="text-caption text-fg-subtle">
                          Consistência (30 dias):{' '}
                          {consistency.rate === null
                            ? 'sem dias esperados'
                            : `${String(Math.round(consistency.rate * 100))}% (${String(consistency.met)} de ${String(consistency.eligible)} ${streak.unit === 'weeks' ? 'semanas' : 'dias'})`}{' '}
                          · melhor sequência: {streak.best}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        title="Novo hábito"
        size="lg"
      >
        <HabitForm
          today={today}
          onSaved={() => {
            setCreating(false);
          }}
          onCancel={() => {
            setCreating(false);
          }}
        />
      </Dialog>
      <Dialog
        open={open !== undefined}
        onClose={() => {
          setOpenId(null);
        }}
        title={open?.name ?? 'Hábito'}
        size="lg"
      >
        {open && (
          <HabitDetail
            key={open.id}
            habit={open}
            checkins={checkins}
            today={today}
            weekStartsOn={weekStartsOn}
            onDeleted={() => {
              setOpenId(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function TodayRow({
  habit,
  checkins,
  today,
  weekStartsOn,
}: {
  habit: Habit;
  checkins: readonly HabitCheckin[];
  today: ISODate;
  weekStartsOn: number;
}) {
  const { set, undo } = useCheckin();
  const existing = checkins.find((c) => c.habit_id === habit.id && c.local_date === today);
  const [value, setValue] = useState(
    existing?.value !== null && existing?.value !== undefined ? String(existing.value) : '',
  );
  const rule = toRule(habit);
  const met = isMet(rule, existing ? { localDate: today, value: existing.value } : undefined);
  const week = weekProgress(rule, toCheckins(checkins, habit.id), today, weekStartsOn);
  const busy = set.isPending || undo.isPending;
  const numeric = habit.target_value !== null;
  const parsed = Number(value.replace(',', '.'));

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors',
        met ? 'border-success/35 bg-success-soft/50' : 'border-border bg-surface-muted/40',
      )}
    >
      <IconChip tone={met ? 'success' : 'neutral'} size="md" className="rounded-full">
        {met ? <CheckCircle2 /> : <Circle />}
      </IconChip>
      <div className="min-w-[9rem] flex-1">
        <p className="font-medium">
          {habit.name}
          {met && <span className="sr-only"> (feito hoje)</span>}
        </p>
        <p className="text-caption text-fg-subtle">
          {habit.schedule_kind === 'times_per_week'
            ? `${String(week.done)} de ${String(week.target)} nesta semana`
            : describeSchedule(rule)}
          {existing && !met && numeric && ' · abaixo da meta (registrado, não conta)'}
        </p>
      </div>
      {numeric && (
        <div className="flex items-center gap-1.5">
          <label htmlFor={`habit-value-${habit.id}`} className="sr-only">
            Quantidade de {habit.name} ({habit.unit})
          </label>
          <input
            id={`habit-value-${habit.id}`}
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
            placeholder={String(habit.target_value)}
            className="h-10 w-20 rounded-md border border-border-strong bg-surface-raised px-2 text-right text-body-sm tabular"
          />
          <span className="text-caption text-fg-subtle">{habit.unit}</span>
        </div>
      )}
      {existing && (!numeric || String(existing.value) === value.replace(',', '.')) ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<Undo2 className="size-4" />}
          disabled={busy}
          onClick={() => {
            undo.mutate(existing.id, {
              onSuccess: () => {
                setValue('');
              },
            });
          }}
          aria-label={`Desfazer marcação de ${habit.name}`}
        >
          Desfazer
        </Button>
      ) : null}
      <Button
        size="sm"
        variant={met ? 'ghost' : 'secondary'}
        icon={<Check className={met ? 'size-4' : 'size-4 text-primary'} />}
        disabled={
          busy ||
          (existing !== undefined && !numeric) ||
          (numeric && (value.trim() === '' || !Number.isFinite(parsed) || parsed < 0))
        }
        onClick={() => {
          set.mutate({ habitId: habit.id, date: today, value: numeric ? parsed : null, existing });
        }}
        aria-label={
          existing
            ? `${habit.name}: corrigir valor de hoje`
            : `Marcar ${habit.name} como feito hoje`
        }
      >
        {met ? 'Feito' : existing ? 'Corrigir' : 'Marcar'}
      </Button>
    </li>
  );
}

const STATE_STYLES: Record<DayState, string> = {
  met: 'bg-primary/75 text-primary-fg shadow-[0_0_8px_-2px_var(--lo-primary)]',
  partial: 'bg-warning-soft text-warning ring-1 ring-warning/40',
  missed: 'bg-danger-soft text-danger',
  not_eligible: 'bg-transparent text-fg-disabled ring-1 ring-border ring-inset',
  future: 'bg-transparent text-fg-disabled',
  pending: 'bg-surface-muted text-fg ring-1 ring-primary',
  open: 'bg-surface-muted text-fg-subtle',
};

const STATE_LABELS: Record<DayState, string> = {
  met: 'cumprido',
  partial: 'abaixo da meta',
  missed: 'não cumprido',
  not_eligible: 'dia não esperado',
  future: 'futuro',
  pending: 'hoje, pendente',
  open: 'sem marcação',
};

function MiniGrid({
  habit,
  checkins,
  today,
  weekStartsOn,
  weeks,
  onSelect,
}: {
  habit: Habit;
  checkins: readonly HabitCheckin[];
  today: ISODate;
  weekStartsOn: number;
  weeks: number;
  onSelect?: (date: ISODate) => void;
}) {
  const start = addDays(startOfWeek(today, weekStartsOn), -7 * (weeks - 1));
  const days = dateRange(start, addDays(start, weeks * 7));
  const byDate = new Map(
    checkins.filter((c) => c.habit_id === habit.id).map((c) => [c.local_date, c]),
  );
  const rule = toRule(habit);
  return (
    <div
      role={onSelect ? 'group' : 'img'}
      aria-label={`Histórico de ${habit.name}: últimas ${String(weeks)} semanas`}
      className="grid w-full max-w-[17rem] grid-cols-7 gap-1"
    >
      {days.map((d) => {
        const c = byDate.get(d);
        const state = dayState(rule, c ? { localDate: d, value: c.value } : undefined, d, today);
        const label = `${formatDateOnly(d)}: ${STATE_LABELS[state]}${c?.value !== null && c?.value !== undefined ? ` (${String(c.value)})` : ''}`;
        const cls = cn(
          'grid aspect-square min-h-6 place-items-center rounded-sm text-[10px] tabular',
          STATE_STYLES[state],
        );
        return onSelect && state !== 'future' && d >= habit.start_on ? (
          <button
            key={d}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => {
              onSelect(d);
            }}
            className={cn(cls, 'hover:ring-2 hover:ring-primary')}
          >
            {Number(d.slice(8))}
          </button>
        ) : (
          <span
            key={d}
            title={onSelect ? label : undefined}
            className={cls}
            aria-hidden={onSelect ? undefined : true}
          >
            {onSelect ? Number(d.slice(8)) : ''}
          </span>
        );
      })}
    </div>
  );
}

function HabitDetail({
  habit,
  checkins,
  today,
  weekStartsOn,
  onDeleted,
}: {
  habit: Habit;
  checkins: readonly HabitCheckin[];
  today: ISODate;
  weekStartsOn: number;
  onDeleted: () => void;
}) {
  const save = useSaveHabit();
  const remove = useDeleteHabit();
  const { set, undo } = useCheckin();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [value, setValue] = useState('');
  const rule = toRule(habit);
  const own = toCheckins(checkins, habit.id);
  const streak = computeStreak(rule, own, today, weekStartsOn);
  const c30 = computeConsistency(rule, own, today, 30, weekStartsOn);
  const c90 = computeConsistency(rule, own, today, 90, weekStartsOn);
  const selectedCheckin = selected
    ? checkins.find((c) => c.habit_id === habit.id && c.local_date === selected)
    : undefined;
  const numeric = habit.target_value !== null;
  const unitLabel = streak.unit === 'weeks' ? 'semanas' : 'dias';
  const pct = (r: number | null) => (r === null ? '—' : `${String(Math.round(r * 100))}%`);

  if (editing) {
    return (
      <HabitForm
        habit={habit}
        today={today}
        onSaved={() => {
          setEditing(false);
        }}
        onCancel={() => {
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        <Badge>{describeSchedule(rule)}</Badge>
        {habit.status === 'paused' && <Badge tone="warning">Pausado</Badge>}
        {habit.archived_at && <Badge tone="warning">Arquivado</Badge>}
        <Badge>Desde {formatDateOnly(habit.start_on)}</Badge>
      </div>
      {habit.description && <p className="whitespace-pre-wrap">{habit.description}</p>}
      <dl className="grid grid-cols-2 gap-3 rounded-md bg-surface-muted p-4 text-body-sm sm:grid-cols-4">
        <div>
          <dt className="text-caption text-fg-subtle">Sequência atual</dt>
          <dd className="text-title-sm font-semibold">
            {streak.current} {unitLabel}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-subtle">Melhor sequência</dt>
          <dd className="text-title-sm font-semibold">
            {streak.best} {unitLabel}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-subtle">Consistência 30 dias</dt>
          <dd className="text-title-sm font-semibold">{pct(c30.rate)}</dd>
        </div>
        <div>
          <dt className="text-caption text-fg-subtle">Consistência 90 dias</dt>
          <dd className="text-title-sm font-semibold">{pct(c90.rate)}</dd>
        </div>
      </dl>
      <p className="text-caption text-fg-subtle">
        Só contam os dias em que o hábito é esperado
        {habit.schedule_kind === 'times_per_week' ? ' (aqui, a meta é por semana)' : ''}. O dia de
        hoje não quebra a sequência enquanto não termina. Histórico considerado: último ano.
      </p>

      <section aria-labelledby={`grid-${habit.id}`}>
        <h3 id={`grid-${habit.id}`} className="mb-2 text-body-sm font-semibold">
          Últimas 12 semanas — toque num dia para marcar ou corrigir
        </h3>
        <MiniGrid
          habit={habit}
          checkins={checkins}
          today={today}
          weekStartsOn={weekStartsOn}
          weeks={12}
          onSelect={(d) => {
            setSelected(d);
            const c = checkins.find((x) => x.habit_id === habit.id && x.local_date === d);
            setValue(c?.value !== null && c?.value !== undefined ? String(c.value) : '');
          }}
        />
        {selected && (
          <div
            className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
            role="group"
            aria-label={`Marcação de ${formatDateOnly(selected)}`}
          >
            <p className="w-full text-body-sm font-medium">
              {formatDateOnly(selected)}: {selectedCheckin ? 'marcado' : 'sem marcação'}
            </p>
            {numeric && (
              <label className="flex flex-col gap-1 text-caption text-fg-subtle">
                Valor ({habit.unit})
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                  }}
                  className="h-10 w-24 rounded-md border border-border-strong bg-surface-raised px-2 text-body-sm text-fg"
                />
              </label>
            )}
            <Button
              size="sm"
              disabled={
                set.isPending || (numeric && !Number.isFinite(Number(value.replace(',', '.'))))
              }
              onClick={() => {
                set.mutate({
                  habitId: habit.id,
                  date: selected,
                  value: numeric ? Number(value.replace(',', '.')) : null,
                  existing: selectedCheckin,
                });
              }}
            >
              {selectedCheckin ? (numeric ? 'Corrigir valor' : 'Já marcado') : 'Marcar'}
            </Button>
            {selectedCheckin && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Undo2 className="size-4" />}
                disabled={undo.isPending}
                onClick={() => {
                  undo.mutate(selectedCheckin.id);
                }}
              >
                Remover marcação
              </Button>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={<Pencil className="size-4" />}
          onClick={() => {
            setEditing(true);
          }}
        >
          Editar
        </Button>
        <Button
          variant="secondary"
          icon={
            habit.status === 'active' ? <Pause className="size-4" /> : <Play className="size-4" />
          }
          disabled={save.isPending}
          onClick={() => {
            save.mutate({
              id: habit.id,
              row: { name: habit.name, status: habit.status === 'active' ? 'paused' : 'active' },
            });
          }}
        >
          {habit.status === 'active' ? 'Pausar' : 'Retomar'}
        </Button>
        <Button
          variant="secondary"
          disabled={save.isPending}
          onClick={() => {
            save.mutate({
              id: habit.id,
              row: {
                name: habit.name,
                archived_at: habit.archived_at ? null : new Date().toISOString(),
              },
            });
          }}
        >
          {habit.archived_at ? 'Restaurar' : 'Arquivar'}
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
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir hábito?"
        confirmLabel="Excluir hábito"
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          remove.mutate(habit.id, {
            onSuccess: onDeleted,
            onSettled: () => {
              setConfirmDelete(false);
            },
          });
        }}
      >
        Todas as marcações saem junto ({pluralize(own.length, 'registro', 'registros')} no último
        ano). Metas ligadas ao hábito impedem a exclusão. Para manter o histórico, prefira arquivar.
      </ConfirmDialog>
    </div>
  );
}
