import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';
import { MODULES } from '@/app/modules';

/**
 * Efeitos de acessibilidade a cada troca de rota:
 *  - atualiza o <title> (abas, histórico, leitores de tela);
 *  - move o foco para o conteúdo principal (exceto no primeiro carregamento),
 *    para que usuários de teclado/leitor de tela não fiquem presos na navegação.
 */
export function useRouteChange(mainRef: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const isFirst = useRef(true);

  useEffect(() => {
    const mod = MODULES.find((m) => m.path === pathname);
    document.title = mod ? `${mod.label} · LifeOS` : 'Página não encontrada · LifeOS';

    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname, mainRef]);
}
