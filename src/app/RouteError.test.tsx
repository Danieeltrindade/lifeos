import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { isChunkLoadError } from './chunk-error';
import { RouteError } from './RouteError';

function Boom({ error }: { error: Error }): never {
  throw error;
}

function renderWith(error: Error) {
  const router = createMemoryRouter([
    { path: '/', errorElement: <RouteError />, element: <Boom error={error} /> },
  ]);
  render(<RouterProvider router={router} />);
}

describe('RouteError', () => {
  it('mostra orientação em português, sem a mensagem técnica', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderWith(new Error('relation "public.segredo" does not exist'));
    expect(screen.getByRole('heading', { name: 'Algo deu errado nesta tela' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    expect(document.body.textContent).not.toContain('segredo');
  });

  it('reconhece versão desatualizada (arquivo de tela que sumiu após um deploy)', () => {
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js')),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Network error'))).toBe(false);
  });
});
