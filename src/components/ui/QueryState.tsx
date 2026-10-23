import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/query/query-client';
import { ErrorState, Skeleton } from './States';

/**
 * Estados padronizados de uma leitura: carregando (esqueleto), erro (com nova tentativa)
 * e pronto. Vazio é decidido por quem renderiza, porque cada tela explica o vazio do seu jeito.
 */
export function QueryState<T>({
  query,
  title = 'Não foi possível carregar',
  skeleton,
  children,
}: {
  query: Pick<UseQueryResult<T>, 'status' | 'data' | 'error' | 'refetch' | 'isFetching'>;
  title?: string;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.status === 'pending') {
    return (
      <div role="status" aria-live="polite" aria-label="Carregando">
        {skeleton ?? <ListSkeleton />}
      </div>
    );
  }
  if (query.status === 'error') {
    return (
      <ErrorState
        title={title}
        description={errorMessage(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  return <>{children(query.data as T)}</>;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-md" />
      ))}
    </div>
  );
}
