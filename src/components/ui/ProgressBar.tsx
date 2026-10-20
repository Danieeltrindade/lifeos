import { cn } from '@/lib/cn';

/** Barra de progresso acessível. `value` e `max` são valores de domínio (ex.: 23 de 60 h). */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  tone = 'primary',
  className,
}: {
  value: number;
  max: number;
  label: string;
  valueText?: string;
  tone?: 'primary' | 'accent';
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(value, safeMax)}
      aria-valuetext={valueText}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out-soft',
          tone === 'primary' ? 'bg-primary' : 'bg-accent',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
