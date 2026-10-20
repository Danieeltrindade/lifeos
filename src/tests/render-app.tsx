import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/router';
import type { DataSourceMode } from '@/services/data-source/data-source';

/** Renderiza a aplicação completa (providers + rotas reais) em uma rota inicial. */
export function renderApp(path = '/', options: { dataSource?: DataSourceMode } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders {...(options.dataSource ? { dataSource: options.dataSource } : {})}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}
