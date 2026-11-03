import { FlaskConical } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useNow } from '@/hooks/useNow';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { formatLongDate, greetingFor } from '@/lib/date';
import { useDataSource } from '@/services/data-source/data-source-context';
import { useProfile } from '@/services/profile/profile-context';
import type { DashboardSummary } from '@/types/domain';
import { useActiveSessionQuery } from '@/modules/studies/data/studies-api';
import { formatClock, isPaused, netSeconds } from '@/modules/studies/logic/timer';
import { AgendaSection } from './components/AgendaSection';
import { DashboardHero } from './components/DashboardHero';
import { KpiStrip } from './components/KpiStrip';
import { WeeklyProgress } from './components/WeeklyProgress';
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
import { useDashboardInsights, type DashboardInsights } from './useDashboardInsights';
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
  const insights = useDashboardInsights(today, weekStartsOn);
  const { state: profile } = useProfile();
  const isDemo =
    (state.status === 'ready' || state.status === 'empty') && state.data.origin === 'demo';
  const firstName =
    profile.status === 'ready' ? profile.profile.displayName.trim().split(/\s+/)[0] : '';
  const greeting = greetingFor(now, timezone);
  const ready = state.status === 'ready' || state.status === 'empty';

  return (
    <div className="animate-fade-up">
      <DashboardHero
        title={firstName ? `${greeting}, ${firstName}!` : `${greeting}!`}
        initial={(firstName || '·').charAt(0).toUpperCase()}
        date={formatLongDate(now, timezone)}
        dateTime={now.toISOString()}
        summary={
          ready && state.status === 'ready' ? (
            <DaySummary plan={plan} reviewCounts={state.data.reviewCounts} />
          ) : (
            'Seu dia em um só lugar: o que está planejado e o que já aconteceu.'
          )
        }
        badge={
          isDemo ? (
            <Badge tone="accent">
              <FlaskConical aria-hidden="true" className="size-3.5" />
              Dados fictícios
            </Badge>
          ) : undefined
        }
      >
        <QuickActions />
      </DashboardHero>

      <ActiveSession />
      <RecommendationRefresh />

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
          <DashboardGrid
            data={state.data}
            plan={plan}
            insights={insights}
            now={now}
            empty={state.status === 'empty'}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Resumo do dia em uma linha, só com contagens COMPLETAS (agenda e hábitos de hoje, revisões
 * pendentes). A lista de tarefas prioritárias é recortada, então não vira contagem aqui.
 */
function DaySummary({
  plan,
  reviewCounts,
}: {
  plan: TodayPlan;
  reviewCounts: { overdue: number; dueToday: number };
}) {
  const parts: string[] = [];
  if (plan.status === 'ready') {
    const timed = plan.agenda.length;
    parts.push(
      timed === 0
        ? 'Nada na agenda hoje'
        : `${String(timed)} ${timed === 1 ? 'item' : 'itens'} na agenda`,
    );
    if (plan.habits.length > 0) {
      const done = plan.habits.filter((h) => h.done).length;
      parts.push(`${String(done)} de ${String(plan.habits.length)} hábitos feitos`);
    }
  }
  const pending = reviewCounts.overdue + reviewCounts.dueToday;
  if (pending > 0)
    parts.push(`${String(pending)} ${pending === 1 ? 'revisão' : 'revisões'} para hoje`);
  if (parts.length === 0)
    return <>Seu dia em um só lugar: o que está planejado e o que já aconteceu.</>;
  return <>{parts.join(' · ')}.</>;
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
  insights,
  now,
  empty,
}: {
  data: DashboardSummary;
  plan: TodayPlan;
  insights: DashboardInsights;
  now: Date;
  empty: boolean;
}) {
  const hasStudy = data.studies.actualMinutesLast7Days > 0 || plan.plannedStudyMinutes > 0;
  // Coluna principal: o que fazer HOJE. Coluna lateral: acompanhamento. Rodapé: histórico.
  const today = [
    (plan.agenda.length > 0 || data.setup.events > 0) && (
      <AgendaSection key="agenda" items={plan.agenda} now={now} timeZone={data.timezone} />
    ),
    data.priorityTasks.length > 0 && (
      <TasksSection key="tasks" tasks={data.priorityTasks} today={data.localDate} />
    ),
    plan.habits.length > 0 && <HabitsTodaySection key="habits" habits={plan.habits} />,
    data.activeProjects.length > 0 && (
      <ProjectsSection key="projects" projects={data.activeProjects} />
    ),
  ].filter(Boolean);
  const progress = [
    hasStudy && (
      <WeeklyProgress key="week" week={insights.week} weeklyTarget={insights.weeklyTarget} />
    ),
    hasStudy && (
      <StudySection
        key="studies"
        studies={data.studies}
        plannedMinutesToday={plan.plannedStudyMinutes}
      />
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
  ].filter(Boolean);
  const history = [
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
      {!empty && (
        <KpiStrip
          insights={insights}
          plan={plan}
          studyToday={data.studies.actualMinutesToday}
          studyLast7={data.studies.actualMinutesLast7Days}
        />
      )}
      <Onboarding setup={data.setup} compact={!empty} />
      {plan.status === 'error' && (
        <p role="status" className="mb-4 text-body-sm text-warning">
          A agenda e os hábitos de hoje não carregaram; o restante do painel está atualizado.
        </p>
      )}
      {today.length + progress.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-5">
          {today.length > 0 && <div className="flex min-w-0 flex-col gap-4 lg:gap-5">{today}</div>}
          {progress.length > 0 && (
            <div className="flex min-w-0 flex-col gap-4 lg:gap-5">{progress}</div>
          )}
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:mt-5 lg:gap-5">
          {history}
        </div>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-5">
      <span className="sr-only">Carregando dashboard…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} aria-hidden="true" className="gap-3 p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      ))}
    </div>
  );
}
