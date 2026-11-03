import { AccountPanel } from './AccountPanel';
import { Brand } from './Brand';
import { NavList } from './NavList';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex h-[4.5rem] items-center px-6">
        <Brand />
      </div>
      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
        <NavList />
      </nav>
      <div className="flex flex-col gap-3 p-3">
        <div className="surface-card rounded-lg border border-border p-2 shadow-elev-1">
          <AccountPanel />
        </div>
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="text-caption text-fg-subtle">Tema</span>
          <ThemeToggle compact />
        </div>
      </div>
    </aside>
  );
}
