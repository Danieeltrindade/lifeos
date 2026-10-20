import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataSource } from '@/services/data-source/data-source-context';
import type { DashboardSummary } from '@/types/domain';
import { getDashboardRepository, isDashboardEmpty } from './data/dashboard-repository';

export type DashboardState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty'; data: DashboardSummary }
  | { status: 'ready'; data: DashboardSummary };

type Settled =
  | { key: string; ok: true; data: DashboardSummary }
  | { key: string; ok: false; message: string };

/**
 * Carrega o resumo do dashboard a partir do repositório da fonte de dados ativa.
 * Estados explícitos: loading → (ready | empty | error). "retry" refaz a requisição.
 * Requisições obsoletas são canceladas (AbortController) e ignoradas.
 */
export function useDashboardSummary(): DashboardState & { retry: () => void } {
  const { mode } = useDataSource();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${mode}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    getDashboardRepository(mode)
      .getSummary(new Date(), controller.signal)
      .then(
        (data) => {
          if (!controller.signal.aborted) setSettled({ key, ok: true, data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : 'Erro desconhecido.';
          setSettled({ key, ok: false, message });
        },
      );
    return () => {
      controller.abort();
    };
  }, [mode, key]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return useMemo(() => {
    if (settled?.key !== key) return { status: 'loading', retry };
    if (!settled.ok) return { status: 'error', message: settled.message, retry };
    return {
      status: isDashboardEmpty(settled.data) ? 'empty' : 'ready',
      data: settled.data,
      retry,
    };
  }, [settled, key, retry]);
}
