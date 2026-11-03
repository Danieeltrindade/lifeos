import { BookOpen, CheckSquare, ChevronRight, Repeat, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { IconChip, type IconTone } from '@/components/ui/IconChip';
import { Skeleton } from '@/components/ui/States';
import { formatDuration } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { DashboardInsights, Loadable } from '../useDashboardInsights';
import type { TodayPlan } from '../useTodayPlan';

interface Tile {
  key: string;
  label: string;
  to: string;
  icon: ReactNode;
  tone: IconTone;
  value: Loadable<{ main: string; sub: ReactNode }>;
}

/**
 * Indicadores principais do dia. Cada número vem de uma consulta real e o card leva à tela
 * onde ele é detalhado; sem dados, o indicador mostra "—" com o motivo (nunca um zero falso).
 */
export function KpiStrip({
  insights,
  plan,
  studyToday,
  studyLast7,
}: {
  insights: DashboardInsights;
  plan: TodayPlan;
  studyToday: number;
  studyLast7: number;
}) {
  const habits: Tile['value'] =
    plan.status === 'loading'
      ? { status: 'loading' }
      : plan.status === 'error'
        ? { status: 'error' }
        : {
            status: 'ready',
            value:
              plan.habits.length === 0
                ? { main: '—', sub: 'Nenhum previsto para hoje' }
                : {
                    main: `${String(plan.habits.filter((h) => h.done).length)}/${String(plan.habits.length)}`,
                    sub: `${String(
                      Math.round(
                        (plan.habits.filter((h) => h.done).length / plan.habits.length) * 100,
                      ),
                    )}% concluído hoje`,
                  },
          };

  const tiles: Tile[] = [
    {
      key: 'tasks',
      label: 'Tarefas abertas',
      to: '/tarefas',
      icon: <CheckSquare />,
      tone: 'primary',
      value: map(insights.tasks, (t) => ({
        main: String(t.open),
        sub:
          t.overdue > 0 ? (
            <span className="text-danger">
              {t.overdue} {t.overdue === 1 ? 'atrasada' : 'atrasadas'}
            </span>
          ) : (
            `${String(t.completedThisWeek)} ${t.completedThisWeek === 1 ? 'concluída' : 'concluídas'} na semana`
          ),
      })),
    },
    {
      key: 'study',
      label: 'Estudo hoje',
      to: '/estudos',
      icon: <BookOpen />,
      tone: 'info',
      value: {
        status: 'ready',
        value: {
          main: formatDuration(studyToday),
          sub: `${formatDuration(studyLast7)} nos últimos 7 dias`,
        },
      },
    },
    {
      key: 'habits',
      label: 'Hábitos de hoje',
      to: '/habitos',
      icon: <Repeat />,
      tone: 'orange',
      value: habits,
    },
    {
      key: 'goals',
      label: 'Metas ativas',
      to: '/metas',
      icon: <Target />,
      tone: 'yellow',
      value: map(insights.goals, (g) => ({
        main: String(g.active),
        sub:
          g.active === 0
            ? 'Nenhuma em andamento'
            : `${String(g.reached)} ${g.reached === 1 ? 'atingida' : 'atingidas'} no ciclo atual`,
      })),
    },
  ];

  return (
    <section aria-labelledby="dash-kpis" className="mb-4 lg:mb-5">
      <h2 id="dash-kpis" className="sr-only">
        Indicadores
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {tiles.map((tile) => (
          <li key={tile.key} className="min-w-0">
            <KpiTile tile={tile} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function map<T>(
  source: Loadable<T>,
  fn: (value: T) => { main: string; sub: ReactNode },
): Tile['value'] {
  return source.status === 'ready' ? { status: 'ready', value: fn(source.value) } : source;
}

function KpiTile({ tile }: { tile: Tile }) {
  const v = tile.value;
  return (
    <Link
      to={tile.to}
      className={cn(
        'group surface-card relative flex h-full flex-col items-start gap-3 rounded-lg border border-border p-4 shadow-elev-1 sm:flex-row sm:items-center sm:gap-4',
        'transition-[border-color,box-shadow,transform] duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elev-2',
      )}
    >
      <IconChip tone={tile.tone} size="lg" className="max-sm:size-10 max-sm:[&_svg]:size-5">
        {tile.icon}
      </IconChip>
      <ChevronRight
        aria-hidden="true"
        className="absolute top-3 right-3 size-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm leading-tight font-medium text-fg-muted sm:truncate">
          {tile.label}
        </p>
        {v.status === 'loading' ? (
          <>
            <span className="sr-only">Carregando…</span>
            <Skeleton className="mt-1.5 h-7 w-16" />
          </>
        ) : v.status === 'ready' ? (
          <>
            <p className="tabular mt-0.5 text-metric font-semibold tracking-tight text-fg">
              {v.value.main}
            </p>
            <p className="text-caption text-fg-subtle sm:truncate">{v.value.sub}</p>
          </>
        ) : (
          <>
            <p className="mt-0.5 text-metric font-semibold text-fg-subtle">—</p>
            <p className="truncate text-caption text-fg-subtle">
              {v.status === 'error' ? 'Não foi possível carregar' : 'Disponível com dados reais'}
            </p>
          </>
        )}
      </div>
    </Link>
  );
}
