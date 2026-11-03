import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

/** Link "Ver tudo" no cabeçalho de um card, levando ao módulo de origem dos dados. */
export function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      title={label}
      className="group -mt-0.5 -mr-1.5 inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-body-sm font-medium text-primary transition-colors hover:bg-primary-soft"
    >
      Ver tudo
      <span className="sr-only">: {label}</span>
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </Link>
  );
}
