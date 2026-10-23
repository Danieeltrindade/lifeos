import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { isChunkLoadError } from './chunk-error';

const RELOAD_KEY = 'lifeos:chunk-reload-at';

/**
 * Erro inesperado numa tela (substitui a página padrão do React Router, que mostra detalhes
 * técnicos em inglês). Nunca exibe a mensagem crua nem a pilha: só orientação e saídas.
 * Para versão desatualizada, recarrega UMA vez sozinho (marcado em sessionStorage, para não
 * entrar em ciclo se o problema for outro).
 */
export function RouteError() {
  const error = useRouteError();
  const stale = isChunkLoadError(error);

  useEffect(() => {
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // Sem sessionStorage: o usuário recarrega pelo botão.
    }
  }, [stale]);

  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-4 py-20 text-center">
      <AlertTriangle aria-hidden="true" className="size-10 text-warning" />
      <h1 className="text-title font-semibold">
        {stale ? 'Há uma versão nova do LifeOS' : 'Algo deu errado nesta tela'}
      </h1>
      <p className="max-w-md text-fg-muted">
        {stale
          ? 'Esta aba ainda usa a versão anterior. Recarregue a página para continuar; seus dados estão salvos no servidor.'
          : 'A tela encontrou um erro inesperado. Seus dados já salvos não foram afetados. Recarregue a página; se o problema continuar, volte ao início.'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          icon={<RefreshCw aria-hidden="true" className="size-4" />}
          onClick={() => {
            window.location.reload();
          }}
        >
          Recarregar
        </Button>
        <Link to="/" reloadDocument className={buttonClasses('secondary')}>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
