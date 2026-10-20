import { useCallback, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { useRouteChange } from '@/hooks/useRouteChange';
import { DemoDataBanner } from './DemoDataBanner';
import { BottomNav, MobileDrawer, MobileTopBar } from './MobileNav';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useRouteChange(mainRef);
  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-md bg-surface-raised px-4 py-2 shadow-elev-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col" inert={menuOpen}>
        <MobileTopBar onOpenMenu={openMenu} menuOpen={menuOpen} />
        <DemoDataBanner />
        <main
          id="conteudo"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-16"
        >
          <Outlet />
        </main>
        <BottomNav onOpenMenu={openMenu} menuOpen={menuOpen} />
      </div>
      <MobileDrawer open={menuOpen} onClose={closeMenu} />
    </div>
  );
}
