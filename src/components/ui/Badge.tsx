import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-fg-muted ring-border',
  primary: 'bg-primary-soft text-primary-soft-fg ring-primary/25',
  accent: 'bg-accent-soft text-accent-soft-fg ring-accent/25',
  success: 'bg-success-soft text-success ring-success/25',
  warning: 'bg-warning-soft text-warning ring-warning/25',
  danger: 'bg-danger-soft text-danger ring-danger/25',
  info: 'bg-info-soft text-info ring-info/25',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-caption font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:size-3',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
