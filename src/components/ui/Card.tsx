import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-surface shadow-elev-1',
        'flex min-w-0 flex-col',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  icon,
  titleId,
  action,
  description,
}: {
  title: string;
  titleId: string;
  icon?: ReactNode;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-muted"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-title-sm font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-caption text-fg-subtle">{description}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex-1 px-5 pb-5', className)}>{children}</div>;
}
