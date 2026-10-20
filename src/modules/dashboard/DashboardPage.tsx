import { FlaskConical, Sprout } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useNow } from '@/hooks/useNow';
import { formatLongDate, greetingFor } from '@/lib/date';
import type { DashboardSummary } from '@/types/domain';
import { AgendaSection } from './components/AgendaSection';
import {
  ActivitiesSection,
  GoalsSection,
  RecommendationsSection,
  ReviewsSection,
  TasksSection,
} from './components/ListSections';
import { QuickActions } from './components/QuickActions';
import { StudySection } from './components/StudySection';
import { useDashboardSummary } from './useDashboardSummary';

export function DashboardPage() {
  const now = useNow();
  const state = useDashboardSummary();
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
          eyebrow={<time dateTime={now.toISOString()}>{formatLongDate(now)}</time>}
          title={`${greetingFor(now)}.`}
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
        {state.status === 'empty' && (
          <>
            <WelcomeNotice />
            <DashboardGrid data={state.data} now={now} />
          </>
        )}
        {state.status === 'ready' && <DashboardGrid data={state.data} now={now} />}
      </div>
    </div>
  );
}

function DashboardGrid({ data, now }: { data: DashboardSummary; now: Date }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <AgendaSection items={data.agenda} now={now} />
      <StudySection studies={data.studies} />
      <TasksSection tasks={data.priorityTasks} now={now} />
      <ReviewsSection reviews={data.reviews} now={now} />
      <GoalsSection goals={data.goals} />
      <ActivitiesSection activities={data.recentActivities} />
      <RecommendationsSection items={data.recommendations} />
    </div>
  );
}

function WelcomeNotice() {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary-soft p-5 sm:flex-row sm:items-start">
      <Sprout aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <div className="text-body-sm">
        <p className="font-medium text-fg">Seu LifeOS ainda está vazio — e isso é o estado real.</p>
        <p className="mt-1 text-fg-muted">
          Os módulos estão sendo construídos por fases e a persistência chega com a integração ao
          Supabase. Para avaliar o layout com conteúdo, ative os{' '}
          <Link
            to="/configuracoes"
            className="font-medium text-primary underline underline-offset-2"
          >
            dados de demonstração
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const spans = [
    'md:col-span-2 lg:col-span-7',
    'lg:col-span-5',
    'lg:col-span-7',
    'lg:col-span-5',
    'lg:col-span-4',
    'lg:col-span-4',
    'md:col-span-2 lg:col-span-4',
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <span className="sr-only">Carregando dashboard…</span>
      {spans.map((span, i) => (
        <Card key={i} aria-hidden="true" className={`${span} gap-3 p-5`}>
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      ))}
    </div>
  );
}
