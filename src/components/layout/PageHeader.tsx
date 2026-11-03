import type { ReactNode } from 'react';
import { getModule, type ModuleId } from '@/app/modules';
import { IconChip } from '@/components/ui/IconChip';

/**
 * Cabeçalho padrão das páginas: ícone do módulo (o mesmo da navegação), título, descrição
 * e ações à direita.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  module,
}: {
  title: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Módulo da página: exibe o mesmo ícone da navegação ao lado do título. */
  module?: ModuleId;
}) {
  const Icon = module ? getModule(module).icon : null;
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <IconChip size="lg" className="hidden sm:grid">
            <Icon />
          </IconChip>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 flex items-center gap-1.5 text-overline font-semibold tracking-[0.08em] text-fg-subtle uppercase [&_svg]:size-3.5">
              {eyebrow}
            </div>
          )}
          <h1 className="text-title font-semibold tracking-[-0.02em] text-balance sm:text-display">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-body-sm text-pretty text-fg-muted sm:text-body">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
