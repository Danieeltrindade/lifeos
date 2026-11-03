import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { ListSkeleton } from '@/components/ui/QueryState';
import { ErrorState } from '@/components/ui/States';
import { errorMessage } from '@/lib/query/query-client';

export function StatsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
  );
}

export function ChartsGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">{children}</div>;
}

/** Nota "Como é calculado" — remete a docs/metrics.md, com a fórmula resumida. */
export function HowCalculated({ children }: { children: ReactNode }) {
  return (
    <details className="mt-6 rounded-lg border border-border surface-card px-4 py-3 text-body-sm text-fg-muted">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-fg">
        <Info aria-hidden="true" className="size-4" />
        Como estes números são calculados
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </details>
  );
}

export function StatsLoading({
  status,
  error,
  retry,
  children,
}: {
  status: 'pending' | 'error' | 'success';
  error: unknown;
  retry: () => void;
  children: () => ReactNode;
}) {
  if (status === 'pending') {
    return (
      <div role="status" aria-live="polite" aria-label="Carregando estatísticas">
        <ListSkeleton rows={4} />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <ErrorState
        title="Não foi possível calcular as estatísticas"
        description={errorMessage(error)}
        onRetry={retry}
      />
    );
  }
  return <>{children()}</>;
}
