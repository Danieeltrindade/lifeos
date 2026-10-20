import type { DataSourceMode } from '@/services/data-source/data-source';
import type { DashboardSummary } from '@/types/domain';
import { buildDemoDashboard } from './demo-dashboard';

/**
 * Contrato de leitura do dashboard. A interface depende apenas desta abstração;
 * a implementação Supabase (Fase 2) consultará uma view/RPC agregada protegida por RLS.
 */
export interface DashboardRepository {
  getSummary(now: Date, signal?: AbortSignal): Promise<DashboardSummary>;
}

export class DashboardLoadError extends Error {
  constructor(message = 'Não foi possível carregar o dashboard.') {
    super(message);
    this.name = 'DashboardLoadError';
  }
}

export function emptyDashboard(): DashboardSummary {
  return {
    origin: 'user',
    agenda: [],
    priorityTasks: [],
    goals: [],
    studies: {
      plannedMinutesToday: 0,
      actualMinutesToday: 0,
      actualMinutesLast7Days: 0,
      sessionsToday: 0,
      topSubjectsLast7Days: [],
    },
    reviews: [],
    recentActivities: [],
    recommendations: [],
  };
}

export function isDashboardEmpty(summary: DashboardSummary): boolean {
  return (
    summary.agenda.length === 0 &&
    summary.priorityTasks.length === 0 &&
    summary.goals.length === 0 &&
    summary.reviews.length === 0 &&
    summary.recentActivities.length === 0 &&
    summary.recommendations.length === 0 &&
    summary.studies.actualMinutesLast7Days === 0 &&
    summary.studies.plannedMinutesToday === 0
  );
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

/** Sem backend: não há dados pessoais a exibir. Retorna um resumo vazio (estado real). */
const noBackendRepository: DashboardRepository = {
  getSummary: () => Promise.resolve(emptyDashboard()),
};

const demoRepository: DashboardRepository = {
  getSummary: (now) => Promise.resolve(buildDemoDashboard(now)),
};

const errorRepository: DashboardRepository = {
  async getSummary(_now, signal) {
    await wait(600, signal);
    throw new DashboardLoadError();
  },
};

const slowRepository: DashboardRepository = {
  async getSummary(now, signal) {
    await wait(2500, signal);
    return buildDemoDashboard(now);
  },
};

export function getDashboardRepository(mode: DataSourceMode): DashboardRepository {
  switch (mode) {
    case 'none':
      return noBackendRepository;
    case 'demo':
      return demoRepository;
    case 'simulate-error':
      return errorRepository;
    case 'simulate-slow':
      return slowRepository;
  }
}
