import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll } from 'vitest';
import { AppProviders } from '@/app/providers';
import { preloadAllPages } from '@/app/page-loaders';
import { routes } from '@/app/router';
import type { DataSourceMode } from '@/services/data-source/data-source';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase';

// Registrado em cada arquivo de teste que usa renderApp: importa as páginas lazy ANTES dos
// testes, com prazo próprio. No Windows, o primeiro import frio de uma página passava de 5 s e
// estourava a espera do findBy do primeiro teste de cada arquivo — um atraso de carregamento,
// não um elemento ausente. Elementos que realmente não aparecem continuam falhando em 5 s.
beforeAll(async () => {
  await preloadAllPages();
}, 120_000);

/**
 * Renderiza a aplicação completa (providers + rotas reais) em uma rota inicial.
 * Por padrão há um usuário logado e o dashboard lê do "Supabase" (cliente falso,
 * que só substitui a rede). Use { signedIn: false } para as telas públicas.
 */
export function renderApp(
  path = '/',
  options: { dataSource?: DataSourceMode; signedIn?: boolean; supabase?: FakeSupabase } = {},
) {
  const supabase =
    options.supabase ?? createFakeSupabase(options.signedIn === false ? { session: null } : {});
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders
      client={supabase.client}
      {...(options.dataSource ? { dataSource: options.dataSource } : {})}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router, supabase };
}
