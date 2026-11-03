import { NavLink } from 'react-router';
import { MODULES, NAV_GROUPS } from '@/app/modules';
import { cn } from '@/lib/cn';

/**
 * Lista de navegação agrupada, derivada do registro de módulos. Usada na sidebar e na gaveta.
 * Grupos com um único item (Dashboard, Configurações) aparecem sem título: menos separadores,
 * mesma ordem e mesmas rotas.
 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const items = MODULES.filter((m) => m.group === group.id);
        if (items.length === 0) return null;
        const headingId = `nav-group-${group.id}`;
        const labelled = items.length > 1;
        const list = (
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
                        'group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-body-sm transition-colors duration-150 lg:min-h-10',
                        isActive
                          ? 'bg-primary-soft font-semibold text-fg ring-1 ring-primary/25 ring-inset'
                          : 'font-medium text-fg-muted hover:bg-surface-muted/70 hover:text-fg',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute top-2.5 bottom-2.5 -left-3 w-[3px] rounded-r-full bg-primary shadow-[0_0_10px_var(--lo-primary)]"
                          />
                        )}
                        <Icon
                          aria-hidden="true"
                          className={cn(
                            'size-[18px] shrink-0 transition-colors',
                            isActive ? 'text-primary' : 'text-fg-subtle group-hover:text-fg-muted',
                          )}
                        />
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
        );
        if (!labelled) return <div key={group.id}>{list}</div>;
        return (
          <div key={group.id} role="group" aria-labelledby={headingId}>
            <p
              id={headingId}
              className="mb-1.5 px-3 text-overline font-semibold tracking-[0.1em] text-fg-subtle uppercase"
            >
              {group.label}
            </p>
            {list}
          </div>
        );
      })}
    </div>
  );
}
