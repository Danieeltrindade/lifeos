import { NavLink } from 'react-router';
import { MODULES, NAV_GROUPS } from '@/app/modules';
import { cn } from '@/lib/cn';

/** Lista de navegação agrupada, derivada do registro de módulos. Usada na sidebar e na gaveta. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const items = MODULES.filter((m) => m.group === group.id);
        if (items.length === 0) return null;
        const headingId = `nav-group-${group.id}`;
        return (
          <div key={group.id} role="group" aria-labelledby={headingId}>
            <p
              id={headingId}
              className="mb-1 px-3 text-caption font-medium tracking-wide text-fg-subtle uppercase"
            >
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex min-h-10 items-center gap-3 rounded-md px-3 text-body-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary-soft text-primary-soft-fg'
                            : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-full bg-primary"
                            />
                          )}
                          <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.status === 'planned' && (
                            <span
                              className="size-1.5 rounded-full bg-border-strong"
                              title="Em desenvolvimento"
                            >
                              <span className="sr-only">(em desenvolvimento)</span>
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
