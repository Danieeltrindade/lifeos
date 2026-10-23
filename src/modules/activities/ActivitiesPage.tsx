import {
  Bike,
  BookOpen,
  BookText,
  Briefcase,
  Clock,
  FolderKanban,
  Plus,
  Tags,
  Timer,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { ListSkeleton } from '@/components/ui/QueryState';
import { FilterSelect, SearchField } from '@/components/ui/SearchField';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import {
  addDays,
  daysBetween,
  formatDateOnly,
  formatDuration,
  formatTime,
  localDateIn,
  relativeDayLabel,
} from '@/lib/date';
import { errorMessage } from '@/lib/query/query-client';
import { matchesSearch, pluralize } from '@/lib/text';
import { zonedToUtc } from '@/lib/zoned';
import {
  useActivitiesQuery,
  useCategoriesQuery,
  useGoalsQuery,
  useProjectsQuery,
  useSubjectsQuery,
  useTasksQuery,
  useTopicsQuery,
} from '@/services/data/queries';
import { ActivityForm } from './components/ActivityForm';
import { CategoryManager } from './components/CategoryManager';
import { useDeleteActivity } from './data/activity-api';
import {
  goalsCountingActivity,
  INTENSITY_LABELS,
  isKind,
  KIND_LABELS,
  totalsByKind,
  type Activity,
  type ActivityKind,
} from './logic/activities';

const KIND_ICONS: Record<ActivityKind, typeof Clock> = {
  study: BookOpen,
  reading: BookText,
  exercise: Bike,
  project: FolderKanban,
  work: Briefcase,
  leisure: Clock,
  other: Clock,
};

const PERIODS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Último ano' },
];

export function ActivitiesPage() {
  const { today, timezone } = useUserCalendar();
  const [days, setDays] = useState('30');
  const [kind, setKind] = useState<'all' | ActivityKind>('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<
    null | { mode: 'create' } | { mode: 'edit'; activity: Activity }
  >(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const from = zonedToUtc(addDays(today, -(Number(days) - 1)), '00:00', timezone).toISOString();
  const to = zonedToUtc(addDays(today, 1), '00:00', timezone).toISOString();
  const query = useActivitiesQuery(from, to);
  const categories = useCategoriesQuery().data ?? [];
  const subjects = useSubjectsQuery().data ?? [];
  const topics = useTopicsQuery().data ?? [];
  const projects = useProjectsQuery().data ?? [];
  const tasks = useTasksQuery().data ?? [];
  const goals = useGoalsQuery().data ?? [];
  const remove = useDeleteActivity();

  const names = {
    category: new Map(categories.map((c) => [c.id, c.name])),
    subject: new Map(subjects.map((s) => [s.id, s.name])),
    project: new Map(projects.map((p) => [p.id, p.name])),
    task: new Map(tasks.map((t) => [t.id, t])),
  };

  const visible = (query.data ?? []).filter(
    (a) =>
      (kind === 'all' || a.kind === kind) &&
      matchesSearch(search, a.title, a.notes, a.reading_title),
  );
  const totals = totalsByKind(visible);
  const totalSeconds = visible.reduce((sum, a) => sum + a.duration_seconds, 0);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Timer aria-hidden="true" className="size-4" />
            Registrar
          </span>
        }
        title="Atividades"
        description="O que realmente aconteceu: sessões do cronômetro e registros manuais, com métricas por tipo."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Tags className="size-4" />}
              onClick={() => {
                setCategoriesOpen(true);
              }}
            >
              Categorias
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDialog({ mode: 'create' });
              }}
            >
              Nova atividade
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <SearchField
          className="flex-1"
          label="Buscar atividades"
          value={search}
          onChange={setSearch}
        />
        <FilterSelect
          className="sm:w-48"
          label="Período"
          value={days}
          onChange={setDays}
          options={PERIODS}
        />
        <FilterSelect
          className="sm:w-48"
          label="Tipo"
          value={kind}
          onChange={(v) => {
            setKind(v as typeof kind);
          }}
          options={[
            { value: 'all', label: 'Todos' },
            ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>

      {query.status === 'pending' ? (
        <ListSkeleton rows={5} />
      ) : query.status === 'error' ? (
        <ErrorState
          title="Não foi possível carregar as atividades"
          description={errorMessage(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<Timer className="size-6" />}
          title="Nenhuma atividade neste período"
          description="Sessões encerradas no cronômetro aparecem aqui automaticamente. Registre também leituras, exercícios e outras atividades."
          action={
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDialog({ mode: 'create' });
              }}
            >
              Nova atividade
            </Button>
          }
        />
      ) : (
        <>
          <section aria-label="Totais do período" className="mb-4 flex flex-wrap gap-2">
            <Badge tone="primary">Total: {formatDuration(totalSeconds / 60)}</Badge>
            {totals.map((t) => (
              <Badge key={t.kind}>
                {KIND_LABELS[t.kind]}: {formatDuration(t.seconds / 60)} ({t.count})
              </Badge>
            ))}
          </section>
          {visible.length === 0 ? (
            <EmptyState title="Nenhuma atividade com esses filtros" />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface shadow-elev-1">
              {visible.map((a) => {
                const k = isKind(a.kind) ? a.kind : 'other';
                const Icon = KIND_ICONS[k];
                const day = localDateIn(new Date(a.started_at), timezone);
                const endDay = localDateIn(new Date(a.ended_at), timezone);
                const task = a.task_id ? names.task.get(a.task_id) : undefined;
                const counting = goalsCountingActivity(goals, a, task?.project_id ?? null);
                return (
                  <li key={a.id} className="flex items-start gap-3 px-3 py-3 sm:px-4">
                    <span
                      aria-hidden="true"
                      className="mt-1 grid size-8 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-muted"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="min-w-0 truncate text-left font-medium hover:underline"
                          onClick={() => {
                            setDialog({ mode: 'edit', activity: a });
                          }}
                        >
                          {a.title}
                        </button>
                        <span className="shrink-0 font-semibold tabular">
                          {formatDuration(a.duration_seconds / 60)}
                        </span>
                      </div>
                      <p className="text-caption text-fg-subtle">
                        {Math.abs(daysBetween(day, today)) <= 1
                          ? relativeDayLabel(day, today)
                          : formatDateOnly(day)}{' '}
                        · {formatTime(a.started_at, timezone)}–{formatTime(a.ended_at, timezone)}
                        {endDay !== day && ' (dia seguinte)'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge>{KIND_LABELS[k]}</Badge>
                        <Badge tone={a.source === 'timer' ? 'info' : 'neutral'}>
                          {a.source === 'timer' ? 'Cronômetro' : 'Manual'}
                        </Badge>
                        {a.subject_id && names.subject.has(a.subject_id) && (
                          <Badge tone="primary">{names.subject.get(a.subject_id)}</Badge>
                        )}
                        {a.pages !== null && (
                          <Badge>{pluralize(a.pages, 'página', 'páginas')}</Badge>
                        )}
                        {a.reading_title && <Badge>{a.reading_title}</Badge>}
                        {a.distance_km !== null && (
                          <Badge>{String(a.distance_km).replace('.', ',')} km</Badge>
                        )}
                        {a.intensity !== null && <Badge>{INTENSITY_LABELS[a.intensity]}</Badge>}
                        {a.category_id && names.category.has(a.category_id) && (
                          <Badge>{names.category.get(a.category_id)}</Badge>
                        )}
                        {task && <Badge>Tarefa: {task.title}</Badge>}
                        {a.project_id && names.project.has(a.project_id) && (
                          <Badge>Projeto: {names.project.get(a.project_id)}</Badge>
                        )}
                        {counting.length > 0 && (
                          <Badge tone="accent">
                            Conta para: {counting.map((g) => g.title).join(', ')}
                          </Badge>
                        )}
                      </div>
                      {a.notes && (
                        <p className="mt-1 line-clamp-2 text-body-sm text-fg-muted">{a.notes}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Excluir ${a.title}`}
                      onClick={() => {
                        setDeleting(a);
                      }}
                      className="grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => {
          setDialog(null);
        }}
        title={dialog?.mode === 'edit' ? 'Editar atividade' : 'Nova atividade'}
        size="lg"
      >
        {dialog && (
          <ActivityForm
            key={dialog.mode === 'edit' ? dialog.activity.id : 'new'}
            {...(dialog.mode === 'edit' ? { activity: dialog.activity } : {})}
            timezone={timezone}
            categories={categories}
            subjects={subjects}
            topics={topics}
            projects={projects}
            tasks={tasks}
            onSaved={() => {
              setDialog(null);
            }}
            onCancel={() => {
              setDialog(null);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={categoriesOpen}
        onClose={() => {
          setCategoriesOpen(false);
        }}
        title="Categorias de atividade"
      >
        <CategoryManager categories={categories} />
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title="Excluir atividade?"
        confirmLabel="Excluir atividade"
        pending={remove.isPending}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting, {
            onSettled: () => {
              setDeleting(null);
            },
          });
        }}
      >
        {deleting?.source === 'timer'
          ? 'Esta atividade veio do cronômetro: a sessão de foco correspondente (e a reflexão dela) também será excluída. '
          : ''}
        Estatísticas e metas que usam este registro são recalculadas.
      </ConfirmDialog>
    </div>
  );
}
