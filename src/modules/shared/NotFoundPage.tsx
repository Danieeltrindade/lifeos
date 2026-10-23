import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/ui/button-classes';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <Compass aria-hidden="true" className="size-10 text-fg-subtle" />
      <h1 className="text-title font-semibold">Página não encontrada</h1>
      <p className="max-w-sm text-fg-muted">
        O endereço acessado não corresponde a nenhuma área do LifeOS.
      </p>
      <Link to="/" className={buttonClasses('primary')}>
        Voltar ao dashboard
      </Link>
    </div>
  );
}
