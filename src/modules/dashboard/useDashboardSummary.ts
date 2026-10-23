import { useQuery } from '@tanstack/react-query';
import { errorMessage } from '@/lib/query/query-client';
import { useDataSource } from '@/services/data-source/data-source-context';
import { useSupabase } from '@/services/supabase/supabase-context';
import type { DashboardSummary } from '@/types/domain';
import { getDashboardRepository, isDashboardEmpty } from './data/dashboard-repository';

export type DashboardState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty'; data: DashboardSummary }
  | { status: 'ready'; data: DashboardSummary };

/**
 * Resumo do dashboard (public.dashboard_summary). Está no cache compartilhado sob o domínio
 * "dashboard": qualquer escrita em outro módulo o invalida, então o painel nunca mostra
 * estatísticas velhas depois de uma edição ou exclusão.
 */
export function useDashboardSummary(): DashboardState & { retry: () => void } {
  const { mode } = useDataSource();
  const client = useSupabase();
  const query = useQuery({
    queryKey: ['dashboard', 'summary', mode],
    queryFn: ({ signal }) => getDashboardRepository(mode, client).getSummary(new Date(), signal),
    // Falhas simuladas (modo de inspeção) não devem ser repetidas.
    ...(mode === 'supabase' ? {} : { retry: false }),
  });
  const retry = () => {
    void query.refetch();
  };
  if (query.status === 'pending') return { status: 'loading', retry };
  if (query.status === 'error')
    return { status: 'error', message: errorMessage(query.error), retry };
  return { status: isDashboardEmpty(query.data) ? 'empty' : 'ready', data: query.data, retry };
}
