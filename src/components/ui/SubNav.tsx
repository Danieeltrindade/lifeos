import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';

/** Navegação entre seções de um módulo (links reais; aria-current na seção ativa). */
export function SubNav({
  label,
  items,
}: {
  label: string;
  items: { to: string; label: string; end?: boolean }[];
}) {
  return (
    <nav aria-label={label} className="-mx-1 mb-6 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 rounded-lg border border-border bg-surface/70 p-1 sm:inline-flex">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-10 items-center rounded-md px-3.5 text-body-sm font-medium transition-colors duration-150 sm:h-9',
                  isActive
                    ? 'bg-primary-soft text-primary-soft-fg ring-1 ring-primary/35 ring-inset'
                    : 'text-fg-subtle hover:bg-surface-muted hover:text-fg',
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
