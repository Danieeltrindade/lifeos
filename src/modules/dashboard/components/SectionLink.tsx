import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';

/** Link discreto no cabeçalho de um card, levando ao módulo de origem dos dados. */
export function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg"
    >
      <ArrowUpRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
