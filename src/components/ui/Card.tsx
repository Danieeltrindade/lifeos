import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconChip, type IconTone } from './IconChip';

export function Card({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn(
        'surface-card rounded-lg border border-border shadow-elev-1',
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
  iconTone = 'primary',
  titleId,
  action,
  description,
}: {
  title: string;
  titleId: string;
  icon?: ReactNode;
  iconTone?: IconTone;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconChip tone={iconTone}>{icon}</IconChip>}
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
