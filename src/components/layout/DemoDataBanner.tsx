import { FlaskConical } from 'lucide-react';
import { Link } from 'react-router';
import { DATA_SOURCE_LABELS } from '@/services/data-source/data-source';
import { useDataSource } from '@/services/data-source/data-source-context';

/** Aviso global sempre que a interface não estiver mostrando o estado real (modo padrão). */
export function DemoDataBanner() {
  const { mode } = useDataSource();
  if (mode === 'supabase') return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-accent/30 bg-accent-soft px-4 py-2 text-center text-body-sm text-accent-soft-fg"
    >
      <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
      <span>
        <strong className="font-semibold">{DATA_SOURCE_LABELS[mode].label}.</strong>{' '}
        {mode === 'demo' ? 'Os dados exibidos são fictícios. ' : 'Modo de inspeção ativo. '}
        <Link to="/configuracoes" className="underline underline-offset-2">
          Alterar
        </Link>
      </span>
    </div>
  );
}
