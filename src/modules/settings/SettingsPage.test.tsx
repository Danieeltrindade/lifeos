import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, makeProfileRow } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

function rpcNames(supabase: { rpc: { mock: { calls: unknown[][] } } }): unknown[] {
  return supabase.rpc.mock.calls.map((call) => call[0]);
}

afterEach(() => {
  // jsdom não implementa createObjectURL; o teste de exportação define e aqui removemos.
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

async function profileRegion() {
  return screen.findByRole('region', { name: 'Perfil' });
}

describe('Configurações — perfil', () => {
  it('carrega o perfil da conta', async () => {
    renderApp('/configuracoes');
    const region = await profileRegion();
    expect(await within(region).findByLabelText('Nome de exibição')).toHaveValue('Ana');
    expect(within(region).getByLabelText('Fuso horário')).toHaveValue('America/Sao_Paulo');
    expect(within(region).getByLabelText('A semana começa')).toHaveValue('1');
  });

  it('grava alterações no banco e confirma', async () => {
    const user = userEvent.setup();
    const { supabase } = renderApp('/configuracoes');
    const region = await profileRegion();
    const name = await within(region).findByLabelText('Nome de exibição');
    const save = within(region).getByRole('button', { name: 'Salvar perfil' });
    expect(save).toBeDisabled();

    await user.clear(name);
    await user.type(name, '  Ana Paula  ');
    await user.selectOptions(within(region).getByLabelText('Fuso horário'), 'Europe/Lisbon');
    await user.selectOptions(within(region).getByLabelText('A semana começa'), '0');
    await user.click(save);

    expect(await within(region).findByText('Perfil salvo.')).toBeInTheDocument();
    expect(supabase.state.profile).toMatchObject({
      display_name: 'Ana Paula',
      timezone: 'Europe/Lisbon',
      week_starts_on: 0,
    });
  });

  it('erro do servidor ao salvar aparece sem detalhes internos', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    renderApp('/configuracoes', { supabase });
    const region = await profileRegion();
    const name = await within(region).findByLabelText('Nome de exibição');
    supabase.state.profileError = {
      code: '23514',
      message: 'violates check constraint "profiles_timezone_valid"',
    };
    await user.type(name, 'x');
    await user.click(within(region).getByRole('button', { name: 'Salvar perfil' }));
    const alert = await within(region).findByRole('alert');
    expect(alert).toHaveTextContent('Alguns dados são inválidos');
    expect(alert).not.toHaveTextContent('profiles_timezone_valid');
  });

  it('falha ao carregar o perfil oferece nova tentativa', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.profileError = { code: '', message: 'Failed to fetch', name: 'TypeError' };
    renderApp('/configuracoes', { supabase });
    const region = await profileRegion();
    expect(await within(region).findByRole('alert')).toHaveTextContent(/sem conexão/i);
    supabase.state.profileError = null;
    await user.click(within(region).getByRole('button', { name: /tentar novamente/i }));
    expect(await within(region).findByLabelText('Nome de exibição')).toHaveValue('Ana');
  });
});

describe('Configurações — tema sincronizado com a conta', () => {
  it('aplica o tema salvo no perfil e grava mudanças feitas neste dispositivo', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.profile = makeProfileRow({ theme_preference: 'dark' });
    renderApp('/configuracoes', { supabase });
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    const appearance = screen.getByRole('region', { name: 'Aparência' });
    await user.click(within(appearance).getByRole('radio', { name: /claro/i }));
    await waitFor(() => {
      expect(supabase.state.profile?.theme_preference).toBe('light');
    });
  });
});

describe('Configurações — conta', () => {
  it('exporta os dados da conta em JSON', async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:lifeos'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { supabase } = renderApp('/configuracoes');
    const account = await screen.findByRole('region', { name: 'Conta' });
    await user.click(within(account).getByRole('button', { name: /exportar meus dados/i }));
    expect(await within(account).findByText(/exportação concluída/i)).toBeInTheDocument();
    expect(rpcNames(supabase)).toContain('export_my_data');
    expect(click).toHaveBeenCalled();
  });

  it('exclusão exige a palavra de confirmação e a senha', async () => {
    const user = userEvent.setup();
    const { supabase } = renderApp('/configuracoes');
    const danger = await screen.findByRole('region', { name: 'Excluir conta' });
    await user.click(within(danger).getByRole('button', { name: /quero excluir/i }));
    await user.type(within(danger).getByLabelText('Digite EXCLUIR para confirmar'), 'excluir');
    await user.click(
      within(danger).getByRole('button', { name: /excluir conta definitivamente/i }),
    );
    expect(await within(danger).findByText('Informe sua senha.')).toBeInTheDocument();
    expect(within(danger).getByText('Digite EXCLUIR para confirmar.')).toBeInTheDocument();
    expect(rpcNames(supabase)).not.toContain('delete_my_account');
  });

  it('senha errada impede a exclusão', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    renderApp('/configuracoes', { supabase });
    const danger = await screen.findByRole('region', { name: 'Excluir conta' });
    await user.click(within(danger).getByRole('button', { name: /quero excluir/i }));
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null as never, user: null as never },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 },
    });
    await user.type(within(danger).getByLabelText('Sua senha'), 'errada');
    await user.type(within(danger).getByLabelText('Digite EXCLUIR para confirmar'), 'EXCLUIR');
    await user.click(
      within(danger).getByRole('button', { name: /excluir conta definitivamente/i }),
    );
    expect(await within(danger).findByRole('alert')).toHaveTextContent('Senha incorreta.');
    expect(rpcNames(supabase)).not.toContain('delete_my_account');
  });

  it('reautentica, exclui no banco e encerra a sessão', async () => {
    const user = userEvent.setup();
    const { supabase, router } = renderApp('/configuracoes');
    const danger = await screen.findByRole('region', { name: 'Excluir conta' });
    await user.click(within(danger).getByRole('button', { name: /quero excluir/i }));
    await user.type(within(danger).getByLabelText('Sua senha'), 'senha-correta');
    await user.type(within(danger).getByLabelText('Digite EXCLUIR para confirmar'), 'EXCLUIR');
    await user.click(
      within(danger).getByRole('button', { name: /excluir conta definitivamente/i }),
    );

    expect(
      await screen.findByText('Sua conta e todos os seus dados foram excluídos.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'senha-correta',
    });
    expect(rpcNames(supabase)).toContain('delete_my_account');
  });

  it('ferramentas de desenvolvimento aparecem apenas em modo dev', async () => {
    renderApp('/configuracoes');
    expect(
      await screen.findByRole('region', { name: 'Fonte de dados do dashboard' }),
    ).toBeInTheDocument();
  });
});
