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
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  '-mb-px inline-flex h-11 items-center border-b-2 px-3 text-body-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-fg'
                    : 'border-transparent text-fg-subtle hover:text-fg',
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
