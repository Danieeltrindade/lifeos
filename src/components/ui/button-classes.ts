import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-soft active:translate-y-px disabled:pointer-events-none disabled:text-fg-disabled';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-fg shadow-elev-1 hover:bg-primary-hover disabled:bg-surface-muted',
  secondary:
    'border border-border-strong bg-surface-raised text-fg shadow-elev-1 hover:bg-surface-muted',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
};

// Alvos de toque com pelo menos 40px (sm) / 44px (md).
const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-body-sm',
  md: 'h-11 px-4 text-body',
};

/**
 * Classes do botão, reutilizáveis em elementos que não são <button>
 * (ex.: <Link> com aparência de botão). Mantido fora de Button.tsx para
 * que o arquivo do componente exporte apenas componentes (Fast Refresh).
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
) {
  return cn(base, variants[variant], sizes[size], extra);
}
