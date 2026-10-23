import { browserTimeZone, localDateIn } from '@/lib/date';
import type { DataSourceMode } from '@/services/data-source/data-source';
import type { LifeosClient } from '@/services/supabase/client';
import { AppError, toAppError } from '@/services/supabase/errors';
import type { DashboardSummary } from '@/types/domain';
import { parseDashboardSummary } from './dashboard-schema';
import { buildDemoDashboard } from './demo-dashboard';

/**
 * Contrato de leitura do dashboard. A página depende apenas desta abstração.
 * A implementação real chama a função public.dashboard_summary (SECURITY INVOKER: o RLS
 * garante que só os dados do usuário entram no resumo).
 */
export interface DashboardRepository {
  getSummary(now: Date, signal?: AbortSignal): Promise<DashboardSummary>;
}

export function emptyDashboard(
  timezone = browserTimeZone(),
  localDate = localDateIn(new Date(), timezone),
): DashboardSummary {
  return {
    origin: 'user',
    timezone,
    localDate,
    priorityTasks: [],
    goals: [],
    studies: {
      actualMinutesToday: 0,
      actualMinutesLast7Days: 0,
      sessionsToday: 0,
      topSubjectsLast7Days: [],
    },
    reviews: [],
    reviewCounts: { overdue: 0, dueToday: 0 },
    recentActivities: [],
    activeProjects: [],
    recommendations: [],
    setup: { subjects: 0, tasks: 0, habits: 0, goals: 0, activities: 0, events: 0 },
  };
}

/** Conta sem nenhum registro: o dashboard mostra o painel de primeiros passos. */
export function isDashboardEmpty(summary: DashboardSummary): boolean {
  return Object.values(summary.setup).every((n) => n === 0);
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function createSupabaseDashboardRepository(client: LifeosClient): DashboardRepository {
  return {
    async getSummary(now, signal) {
      let query = client.rpc('dashboard_summary', { p_now: now.toISOString() });
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error) throw toAppError(error);
      try {
        return parseDashboardSummary(data);
      } catch {
        // Contrato quebrado entre banco e interface: erro de programação, não do usuário.
        throw new AppError(
          'unknown',
          'O servidor respondeu em um formato inesperado. Atualize a página; se persistir, a versão do banco e a da interface estão diferentes.',
          'CONTRACT',
        );
      }
    },
  };
}

const demoRepository: DashboardRepository = {
  getSummary: (now) => Promise.resolve(buildDemoDashboard(now)),
};

const errorRepository: DashboardRepository = {
  async getSummary(_now, signal) {
    await wait(600, signal);
    throw new AppError(
      'network',
      'Falha simulada: não foi possível carregar o dashboard.',
      'SIMULATED',
    );
  },
};

const slowRepository: DashboardRepository = {
  async getSummary(now, signal) {
    await wait(2500, signal);
    return buildDemoDashboard(now);
  },
};

export function getDashboardRepository(
  mode: DataSourceMode,
  client: LifeosClient,
): DashboardRepository {
  // Os modos de inspeção só existem em desenvolvimento. Este desvio com import.meta.env.DEV
  // (constante no build) também tira os dados fictícios do pacote de produção.
  if (!import.meta.env.DEV) return createSupabaseDashboardRepository(client);
  switch (mode) {
    case 'supabase':
      return createSupabaseDashboardRepository(client);
    case 'demo':
      return demoRepository;
    case 'simulate-error':
      return errorRepository;
    case 'simulate-slow':
      return slowRepository;
  }
}
