import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Anel do cronômetro (decorativo; os valores estão no texto central, que é lido normalmente).
 * `fraction` vai de 0 a 1: progresso da meta da sessão ou, sem meta, o ponteiro dos segundos.
 */
export function FocusRing({
  fraction,
  tone = 'primary',
  dimmed = false,
  className,
  children,
}: {
  fraction: number;
  tone?: 'primary' | 'success';
  dimmed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const r = 92;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[17rem]', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 200 200"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          strokeWidth="7"
          className="stroke-progress-track"
        />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          className={cn(
            'transition-[stroke-dashoffset] duration-1000 ease-linear',
            tone === 'success' ? 'stroke-complete text-complete' : 'stroke-primary text-primary',
            dimmed && 'opacity-40',
          )}
          style={{
            filter: 'drop-shadow(0 0 8px color-mix(in srgb, currentColor 45%, transparent))',
          }}
        />
      </svg>
      <div className="absolute inset-[12%] grid place-content-center rounded-full bg-surface-muted/40 text-center ring-1 ring-border ring-inset">
        {children}
      </div>
    </div>
  );
}
