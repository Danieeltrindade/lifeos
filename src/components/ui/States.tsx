import { AlertTriangle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/** Estado vazio: explica o que aparecerá aqui e, quando existir, como começar. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed border-border-strong text-center',
        compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-10',
      )}
    >
      {icon && (
        <span aria-hidden="true" className="text-fg-subtle">
          {icon}
        </span>
      )}
      <p className="text-body-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-xs text-body-sm text-fg-subtle">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Algo deu errado',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-5 sm:flex-row sm:items-center"
    >
      <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{title}</p>
        {description && <p className="text-body-sm text-fg-muted">{description}</p>}
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          icon={<RotateCw className="size-4" />}
        >
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton rounded-sm', className)} />;
}
