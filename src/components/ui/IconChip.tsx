import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type IconTone =
  'primary' | 'violet' | 'orange' | 'yellow' | 'success' | 'info' | 'danger' | 'neutral';

const tones: Record<IconTone, string> = {
  primary: 'bg-primary-soft text-primary ring-primary/25',
  violet: 'bg-violet-soft text-violet ring-violet/25',
  orange: 'bg-orange-soft text-orange ring-orange/25',
  yellow: 'bg-yellow-soft text-yellow ring-yellow/25',
  success: 'bg-success-soft text-success ring-success/25',
  info: 'bg-info-soft text-info ring-info/25',
  danger: 'bg-danger-soft text-danger ring-danger/25',
  neutral: 'bg-surface-muted text-fg-muted ring-border',
};

const sizes = {
  sm: 'size-8 rounded-md [&_svg]:size-4',
  md: 'size-10 rounded-lg [&_svg]:size-5',
  lg: 'size-12 rounded-xl [&_svg]:size-6',
} as const;

/**
 * Ícone decorativo dentro de um "chip" com a cor do domínio. A cor nunca é a única pista:
 * o texto ao lado sempre identifica a seção ou o indicador.
 */
export function IconChip({
  tone = 'primary',
  size = 'sm',
  className,
  children,
}: {
  tone?: IconTone;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center ring-1 ring-inset',
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
