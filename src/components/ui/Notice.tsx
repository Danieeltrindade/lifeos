import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { box: string; icon: typeof Info }> = {
  info: { box: 'border-info/30 bg-info-soft', icon: Info },
  success: { box: 'border-success/30 bg-success-soft', icon: CheckCircle2 },
  warning: { box: 'border-warning/30 bg-warning-soft', icon: AlertTriangle },
  danger: { box: 'border-danger/30 bg-danger-soft', icon: XCircle },
};

const ICON_COLOR: Record<Tone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * Aviso em linha. Erros usam role="alert" (anunciados imediatamente); os demais,
 * role="status" (anunciados sem interromper).
 */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border p-3.5 text-body-sm', box, className)}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', ICON_COLOR[tone])} />
      <div className="min-w-0">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={cn('text-fg-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}
