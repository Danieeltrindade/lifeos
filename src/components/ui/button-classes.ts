import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-soft active:translate-y-px disabled:pointer-events-none disabled:text-fg-disabled [&_svg]:shrink-0';

const variants: Record<ButtonVariant, string> = {
  // Primária: cor de destaque sólida — reservada à ação principal de cada tela.
  primary:
    'bg-primary text-primary-fg font-semibold shadow-glow hover:bg-primary-hover disabled:bg-surface-muted disabled:shadow-none',
  // Secundária: superfície com borda — ações comuns.
  secondary:
    'border border-border-strong bg-surface-muted/80 text-fg hover:border-primary/40 hover:bg-surface-raised disabled:bg-surface-muted/50',
  // Fantasma: ações discretas dentro de listas e cartões.
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  // Destrutiva: sempre acompanhada de confirmação no fluxo.
  danger: 'bg-danger text-danger-fg hover:bg-danger/90',
};

// Alvos de toque: 40/44 px no celular; um pouco mais compactos a partir de 640 px.
const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-body-sm sm:h-9',
  md: 'h-11 px-4 text-body-sm sm:h-10',
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
