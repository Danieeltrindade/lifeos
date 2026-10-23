import { useQuery } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import type { Json, Tables } from '@/services/supabase/database.types';
import { mustList, mustSucceed } from '@/services/supabase/result';
import { toAppError } from '@/services/supabase/errors';
import { useSupabase } from '@/services/supabase/supabase-context';
import type { Candidate, RuleId } from '../logic/rules';

export type RecommendationRow = Tables<'recommendations'>;
export type RecStatus = 'pending' | 'accepted' | 'snoozed' | 'dismissed' | 'resolved' | 'expired';

export const OPEN_STATUSES: readonly RecStatus[] = ['pending', 'snoozed', 'accepted'];

export const recKeys = {
  all: ['recommendations', 'all'] as const,
};

/** Recomendações (abertas e histórico recente), mais recentes primeiro. */
export function useRecommendationsQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: recKeys.all,
    queryFn: ({ signal }) =>
      mustList(
        client
          .from('recommendations')
          .select('*')
          .order('generated_at', { ascending: false })
          .limit(300)
          .abortSignal(signal),
      ),
  });
}

export type Decision =
  | { status: 'accepted'; note?: string }
  | { status: 'dismissed'; note?: string }
  | { status: 'resolved'; note?: string }
  | { status: 'snoozed'; until: string }
  | { status: 'pending' };

const DECISION_MESSAGES: Record<Decision['status'], string> = {
  accepted: 'Recomendação aceita. Nada foi alterado automaticamente.',
  dismissed: 'Recomendação rejeitada.',
  resolved: 'Marcada como resolvida.',
  snoozed: 'Recomendação adiada.',
  pending: 'Recomendação reativada.',
};

/**
 * Decisão do usuário. O banco valida as transições (ex.: encerrada não reabre; adiar no
 * máximo 30 dias) e grava data e estado — o histórico fica na própria linha.
 */
export function useDecideRecommendation() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['recommendations'],
    success: (_d, v: { id: string; decision: Decision }) => DECISION_MESSAGES[v.decision.status],
    mutationFn: ({ id, decision }: { id: string; decision: Decision }) =>
      mustSucceed(
        client
          .from('recommendations')
          .update(
            decision.status === 'snoozed'
              ? { status: 'snoozed', snoozed_until: decision.until }
              : decision.status === 'pending'
                ? { status: 'pending', snoozed_until: null }
                : {
                    status: decision.status,
                    decision_note: decision.note?.trim() ? decision.note.trim() : null,
                  },
          )
          .eq('id', id),
      ),
  });
}

export interface SyncResult {
  created: number;
  updated: number;
  skippedCooldown: number;
  skippedExpired: number;
  closed: number;
  expired: number;
  reopened: number;
}

/** Persiste o resultado do motor de regras (deduplicação e encerramento no banco). */
export function useSyncRecommendations() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['recommendations'],
    silentError: true,
    mutationFn: async ({
      candidates,
      evaluated,
    }: {
      candidates: Candidate[];
      evaluated: RuleId[];
    }): Promise<SyncResult> => {
      const { data, error } = await client.rpc('sync_recommendations', {
        p_candidates: candidates as unknown as Json,
        p_rules: evaluated,
      });
      if (error) throw toAppError(error);
      return data as unknown as SyncResult;
    },
  });
}
