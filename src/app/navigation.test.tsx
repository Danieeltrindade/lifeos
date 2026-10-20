import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/tests/render-app';
import { MODULES } from './modules';

function sidebarNav() {
  // A sidebar é a <nav aria-label="Principal"> visível sem abrir a gaveta móvel.
  return screen.getByRole('navigation', { name: 'Principal' });
}

describe('navegação principal', () => {
  it('lista todos os módulos do registro, sem duplicatas de caminho', () => {
    renderApp('/');
    const nav = sidebarNav();
    for (const mod of MODULES) {
      expect(within(nav).getByRole('link', { name: new RegExp(`^${mod.label}`) })).toHaveAttribute(
        'href',
        mod.path,
      );
    }
    const paths = MODULES.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(MODULES.map((m) => [m.label, m.path] as const))(
    'a rota de %s (%s) renderiza a página correspondente',
    async (label, path) => {
      renderApp(path);
      const expected = path === '/' ? /^(Bom dia|Boa tarde|Boa noite)\.$/ : label;
      expect(await screen.findByRole('heading', { level: 1, name: expected })).toBeInTheDocument();
    },
  );

  it('navega ao clicar em um item e marca o item ativo', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await user.click(within(sidebarNav()).getByRole('link', { name: /^Tarefas/ }));
    expect(router.state.location.pathname).toBe('/tarefas');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tarefas' })).toBeInTheDocument();
    expect(within(sidebarNav()).getByRole('link', { name: /^Tarefas/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('módulos não implementados declaram que estão em desenvolvimento', async () => {
    renderApp('/habitos');
    expect(await screen.findByText(/ainda não está disponível/i)).toBeInTheDocument();
    expect(screen.getByText(/nada nesta página registra ou altera dados/i)).toBeInTheDocument();
  });

  it('mostra página 404 para rotas desconhecidas', async () => {
    renderApp('/nao-existe');
    expect(
      await screen.findByRole('heading', { level: 1, name: /página não encontrada/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar ao dashboard/i })).toHaveAttribute('href', '/');
  });

  it('todo link interno aponta para uma rota existente', async () => {
    renderApp('/', { dataSource: 'demo' });
    await screen.findByText('Dados fictícios');
    const known = new Set(MODULES.map((m) => m.path));
    const internal = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/'));
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) expect(known).toContain(href);
  });

  it('atualiza o título do documento conforme a rota', async () => {
    renderApp('/calendario');
    await screen.findByRole('heading', { level: 1, name: 'Calendário' });
    expect(document.title).toBe('Calendário · LifeOS');
  });
});

describe('navegação móvel', () => {
  it('abre a gaveta, prende o foco, fecha com Esc e devolve o foco', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const trigger = screen.getByRole('button', { name: 'Abrir menu' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Menu de navegação' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('fecha a gaveta ao navegar', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Mais' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('link', { name: /^Diário/ }));
    expect(router.state.location.pathname).toBe('/diario');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
