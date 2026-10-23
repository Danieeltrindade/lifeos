import { FlaskConical } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useNow } from '@/hooks/useNow';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { formatLongDate, greetingFor } from '@/lib/date';
import { useDataSource } from '@/services/data-source/data-source-context';
import type { DashboardSummary } from '@/types/domain';
import { useActiveSessionQuery } from '@/modules/studies/data/studies-api';
import { formatClock, isPaused, netSeconds } from '@/modules/studies/logic/timer';
import { AgendaSection } from './components/AgendaSection';
import {
  ActivitiesSection,
  GoalsSection,
  RecommendationsSection,
  ReviewsSection,
  TasksSection,
} from './components/ListSections';
import {
  ActiveSessionBanner,
  HabitsTodaySection,
  ProjectsSection,
} from './components/MoreSections';
import { Onboarding } from './components/Onboarding';
import { QuickActions } from './components/QuickActions';
import { StudySection } from './components/StudySection';
import { useDashboardSummary } from './useDashboardSummary';
import { useTodayPlan, type TodayPlan } from './useTodayPlan';

const RecommendationSync = lazy(() =>
  import('@/modules/recommendations/RecommendationSync').then((m) => ({
    default: m.RecommendationSync,
  })),
);

export function DashboardPage() {
  const now = useNow();
  const { timezone, weekStartsOn, today } = useUserCalendar();
  const state = useDashboardSummary();
  const plan = useTodayPlan(today, timezone, weekStartsOn, now);
  const isDemo =
    (state.status === 'ready' || state.status === 'empty') && state.data.origin === 'demo';

  return (
    <div className="animate-fade-up">
      <div className="relative isolate -mx-4 -mt-6 mb-2 px-4 pt-6 sm:-mx-6 sm:px-6 lg:-mx-10 lg:-mt-10 lg:px-10 lg:pt-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 [background:var(--hero-glow)]"
        />
        <PageHeader
          eyebrow={<time dateTime={now.toISOString()}>{formatLongDate(now, timezone)}</time>}
          title={`${greetingFor(now, timezone)}.`}
          description="Planeje, execute, registre e avalie. O que foi planejado e o que realmente aconteceu ficam sempre separados."
          actions={
            isDemo ? (
              <Badge tone="accent">
                <FlaskConical aria-hidden="true" className="size-3.5" />
                Dados fictícios
              </Badge>
            ) : undefined
          }
        />
      </div>

      <ActiveSession />
      <RecommendationRefresh />
      <QuickActions />

      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <DashboardSkeleton />}
        {state.status === 'error' && (
          <ErrorState
            title="Não foi possível carregar o dashboard"
            description={state.message}
            onRetry={state.retry}
          />
        )}
        {(state.status === 'ready' || state.status === 'empty') && (
          <DashboardGrid data={state.data} plan={plan} now={now} empty={state.status === 'empty'} />
        )}
      </div>
    </div>
  );
}

/** Atualiza as recomendações (regras explícitas) com os dados reais — nunca no modo demonstração. */
function RecommendationRefresh() {
  const { mode } = useDataSource();
  if (mode !== 'supabase') return null;
  return (
    <Suspense fallback={null}>
      <RecommendationSync />
    </Suspense>
  );
}

function ActiveSession() {
  const { mode } = useDataSource();
  const active = useActiveSessionQuery();
  const now = useNow(1000);
  if (mode !== 'supabase' || !active.data) return null;
  const { session, pauses } = active.data;
  return (
    <ActiveSessionBanner
      label={isPaused(pauses) ? 'Sessão de foco pausada' : 'Sessão de foco em andamento'}
      clock={formatClock(netSeconds(session.started_at, pauses, null, now.getTime()))}
    />
  );
}

/**
 * Seções aparecem só quando têm conteúdo real; o que falta vira "primeiros passos" — em vez
 * de uma parede de cards vazios. Cada número aparece uma vez (sem métricas repetidas).
 */
function DashboardGrid({
  data,
  plan,
  now,
  empty,
}: {
  data: DashboardSummary;
  plan: TodayPlan;
  now: Date;
  empty: boolean;
}) {
  const hasStudy = data.studies.actualMinutesLast7Days > 0 || plan.plannedStudyMinutes > 0;
  const sections = [
    (plan.agenda.length > 0 || data.setup.events > 0) && (
      <AgendaSection key="agenda" items={plan.agenda} now={now} timeZone={data.timezone} />
    ),
    hasStudy && (
      <StudySection
        key="studies"
        studies={data.studies}
        plannedMinutesToday={plan.plannedStudyMinutes}
      />
    ),
    plan.habits.length > 0 && <HabitsTodaySection key="habits" habits={plan.habits} />,
    data.priorityTasks.length > 0 && (
      <TasksSection key="tasks" tasks={data.priorityTasks} today={data.localDate} />
    ),
    data.reviews.length > 0 && (
      <ReviewsSection
        key="reviews"
        reviews={data.reviews}
        today={data.localDate}
        counts={data.reviewCounts}
      />
    ),
    data.goals.length > 0 && <GoalsSection key="goals" goals={data.goals} />,
    data.activeProjects.length > 0 && (
      <ProjectsSection key="projects" projects={data.activeProjects} />
    ),
    data.recentActivities.length > 0 && (
      <ActivitiesSection
        key="activities"
        activities={data.recentActivities}
        timeZone={data.timezone}
      />
    ),
    data.recommendations.length > 0 && (
      <RecommendationsSection key="recs" items={data.recommendations} />
    ),
  ].filter(Boolean);

  return (
    <>
      <Onboarding setup={data.setup} compact={!empty} />
      {plan.status === 'error' && (
        <p role="status" className="mb-4 text-body-sm text-warning">
          A agenda e os hábitos de hoje não carregaram; o restante do painel está atualizado.
        </p>
      )}
      {sections.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{sections}</div>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <span className="sr-only">Carregando dashboard…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} aria-hidden="true" className={`${i === 0 ? 'md:col-span-2' : ''} gap-3 p-5`}>
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      ))}
    </div>
  );
}
