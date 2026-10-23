import { Skeleton } from '@/components/ui/States';

/** Enquanto o código de uma página carrega (code splitting). */
export function PageFallback() {
  return (
    <div role="status" aria-label="Carregando página" className="flex flex-col gap-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-5 w-80 max-w-full" />
      <Skeleton className="mt-4 h-40" />
    </div>
  );
}
