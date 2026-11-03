import { Menu, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router';
import { MODULES } from '@/app/modules';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';
import { AccountPanel } from './AccountPanel';
import { Brand } from './Brand';
import { NavList } from './NavList';
import { ThemeToggle } from './ThemeToggle';

export const DRAWER_ID = 'mobile-navigation';

/** Barra superior das telas pequenas (< lg). */
export function MobileTopBar({
  onOpenMenu,
  menuOpen,
}: {
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-sidebar/90 px-4 backdrop-blur-md lg:hidden">
      <Brand />
      <button
        type="button"
        onClick={onOpenMenu}
        aria-expanded={menuOpen}
        aria-controls={DRAWER_ID}
        className="grid size-11 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg"
      >
        <Menu aria-hidden="true" className="size-5" />
        <span className="sr-only">Abrir menu</span>
      </button>
    </header>
  );
}

/** Barra inferior com os módulos principais + "Menu" (todos os módulos). */
export function BottomNav({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const primary = MODULES.filter((m) => m.mobilePrimary);
  const itemClass =
    'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none transition-colors';
  return (
    <nav
      aria-label="Atalhos"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {primary.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex flex-1">
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(itemClass, isActive ? 'text-primary' : 'text-fg-subtle hover:text-fg')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute top-0 h-0.5 w-8 rounded-b-full bg-primary shadow-[0_0_10px_var(--lo-primary)]"
                      />
                    )}
                    <Icon aria-hidden="true" className="size-5" />
                    <span className={isActive ? 'font-semibold' : undefined}>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-expanded={menuOpen}
            aria-controls={DRAWER_ID}
            className={cn(itemClass, 'text-fg-subtle hover:text-fg')}
          >
            <Menu aria-hidden="true" className="size-5" />
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Gaveta modal com a navegação completa. Foco preso, Esc fecha, foco devolvido ao gatilho. */
export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const stableClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useFocusTrap(panelRef, open, stableClose);

  // Fecha ao navegar (inclusive por voltar/avançar do navegador).
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      lastPath.current = location.pathname;
      onClose();
    }
  }, [location.pathname, onClose]);

  // Impede a rolagem do conteúdo de fundo.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-overlay animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-border bg-sidebar shadow-elev-3 animate-fade-in"
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Fechar menu</span>
          </button>
        </div>
        <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
          <NavList onNavigate={onClose} />
        </nav>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="surface-card rounded-lg border border-border p-2">
            <AccountPanel />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-body-sm text-fg-muted">Tema</span>
            <ThemeToggle compact />
          </div>
        </div>
      </div>
    </div>
  );
}
