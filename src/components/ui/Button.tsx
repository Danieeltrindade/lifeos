import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-soft active:translate-y-px disabled:pointer-events-none disabled:text-fg-disabled';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-fg shadow-elev-1 hover:bg-primary-hover disabled:bg-surface-muted',
  secondary:
    'border border-border-strong bg-surface-raised text-fg shadow-elev-1 hover:bg-surface-muted',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90',
};

// Alvos de toque com pelo menos 40px (sm) / 44px (md).
const sizes: Record<Size, string> = {
  sm: 'h-10 px-3 text-body-sm',
  md: 'h-11 px-4 text-body',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}
