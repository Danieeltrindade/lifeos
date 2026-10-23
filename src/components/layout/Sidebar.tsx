import { AccountPanel } from './AccountPanel';
import { Brand } from './Brand';
import { NavList } from './NavList';
import { ThemeToggle } from './ThemeToggle';

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
        <NavList />
      </nav>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <AccountPanel />
        <ThemeToggle compact />
      </div>
    </aside>
  );
}
