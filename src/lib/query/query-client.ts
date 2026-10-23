import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { AppError, toAppError } from '@/services/supabase/errors';

/**
 * Cliente de cache das leituras (TanStack Query) — ver ADR-023.
 *
 *  - O cache vive só na memória da aba e é recriado a cada usuário: nada de dados de negócio
 *    no localStorage competindo com o banco (o banco é a fonte da verdade).
 *  - Erros são convertidos em AppError (mensagem segura em pt-BR). Sessão expirada chama
 *    `onSessionExpired`, que leva ao login.
 *  - Só falhas de rede são repetidas (uma vez); erro de validação ou permissão não melhora
 *    com nova tentativa.
 */
export function createQueryClient(onSessionExpired: () => void): QueryClient {
  const handle = (error: unknown) => {
    if (toAppError(error).kind === 'session_expired') onSessionExpired();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => count < 1 && toAppError(error).kind === 'network',
      },
      mutations: { retry: false },
    },
  });
}

/** Mensagem segura para exibir a partir de qualquer erro de query/mutation. */
export function errorMessage(error: unknown): string {
  return (error instanceof AppError ? error : toAppError(error)).message;
}
