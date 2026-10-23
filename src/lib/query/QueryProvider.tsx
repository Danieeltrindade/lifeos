import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { useAuth } from '@/services/auth/auth-context';
import { createQueryClient } from './query-client';

/**
 * Um cache por usuário: trocar de conta (ou sair) descarta tudo o que estava em memória,
 * então dados de uma conta nunca aparecem para outra.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const { state, handleSessionExpired } = useAuth();
  const userId = state.status === 'signed_in' ? state.user.id : null;
  const client = useMemo(
    () => createQueryClient(handleSessionExpired),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recriar por usuário é o objetivo
    [userId, handleSessionExpired],
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
