import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase, makeSession } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

describe('rotas privadas e redirecionamentos', () => {
  it('sem sessão, uma rota privada leva ao login guardando o destino', async () => {
    const { router } = renderApp('/tarefas?filtro=hoje', { signedIn: false });
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(router.state.location.search).toBe('?redirectTo=%2Ftarefas%3Ffiltro%3Dhoje');
    expect(document.title).toBe('Entrar · LifeOS');
  });

  it('depois do login, volta ao destino guardado', async () => {
    const user = userEvent.setup();
    const { router, supabase } = renderApp('/tarefas', { signedIn: false });
    await user.type(await screen.findByLabelText('E-mail'), '  Ana@Example.test ');
    await user.type(screen.getByLabelText('Senha'), 'senha-correta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Tarefas' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tarefas');
    // E-mail normalizado antes de ir ao servidor.
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'senha-correta',
    });
  });

  it('ignora destinos externos no ?redirectTo (open redirect)', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/entrar?redirectTo=%2F%2Fmalicioso.com', { signedIn: false });
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), 'x');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByText(/ainda está vazio/i);
    expect(router.state.location.pathname).toBe('/');
  });

  it('com sessão salva (recarga da página), abre direto o app', async () => {
    const { router } = renderApp('/configuracoes');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configurações' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/configuracoes');
  });

  it('logado, as telas de login levam ao app', async () => {
    const { router } = renderApp('/entrar');
    await screen.findByText(/ainda está vazio/i);
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('entrar', () => {
  it('valida antes de chamar o servidor', async () => {
    const user = userEvent.setup();
    const { supabase } = renderApp('/entrar', { signedIn: false });
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('credenciais erradas mostram mensagem segura', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase({ session: null });
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null as never, user: null as never },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 },
    });
    renderApp('/entrar', { supabase });
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  it('sem conexão, explica o problema', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase({ session: null });
    supabase.auth.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderApp('/entrar', { supabase });
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), 'x');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sem conexão/i);
  });

  it('link de e-mail expirado mostra aviso compreensível', async () => {
    renderApp(
      '/entrar?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
      {
        signedIn: false,
      },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O link expirou ou já foi usado. Peça um novo.',
    );
    expect(screen.queryByText(/Email link is invalid/)).not.toBeInTheDocument();
  });
});

describe('cadastro', () => {
  async function fillSignUp(user: ReturnType<typeof userEvent.setup>, confirm = 'senha-segura-1') {
    await user.type(await screen.findByLabelText('Como quer ser chamado'), 'Ana');
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-segura-1');
    await user.type(screen.getByLabelText('Confirme a senha'), confirm);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
  }

  it('valida senha mínima e confirmação', async () => {
    const user = userEvent.setup();
    const { supabase } = renderApp('/cadastro', { signedIn: false });
    await fillSignUp(user, 'outra-senha');
    expect(await screen.findByText('As senhas não coincidem.')).toBeInTheDocument();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('envia nome e fuso como metadados e pede confirmação por e-mail', async () => {
    const user = userEvent.setup();
    const { supabase } = renderApp('/cadastro', { signedIn: false });
    await fillSignUp(user);
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument();
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'senha-segura-1',
      options: {
        emailRedirectTo: `${window.location.origin}/entrar?confirmado=1`,
        data: { display_name: 'Ana', timezone: expect.any(String) as string },
      },
    });
  });

  it('e-mail já cadastrado recebe a MESMA resposta (não revela quem tem conta)', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase({ session: null });
    supabase.auth.signUp.mockResolvedValueOnce({
      data: { session: null, user: null as never },
      error: { code: 'user_already_exists', message: 'User already registered', status: 422 },
    });
    renderApp('/cadastro', { supabase });
    await fillSignUp(user);
    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument();
  });
});

describe('recuperação de senha', () => {
  it('pede o link com retorno para /redefinir-senha e responde de forma neutra', async () => {
    const user = userEvent.setup();
    const { supabase } = renderApp('/recuperar-senha', { signedIn: false });
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.test');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByText(/se houver uma conta com este endereço/i)).toBeInTheDocument();
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.test', {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
  });

  it('sem sessão de recuperação, o link é tratado como inválido', async () => {
    renderApp('/redefinir-senha', { signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Link inválido' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir um novo link' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    );
  });

  it('com a sessão do link, grava a nova senha', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase({ session: null });
    renderApp('/redefinir-senha', { supabase });
    await screen.findByRole('heading', { name: 'Link inválido' });
    act(() => {
      supabase.emit('PASSWORD_RECOVERY', makeSession());
    });
    await user.type(await screen.findByLabelText('Nova senha'), 'nova-senha-123');
    await user.type(screen.getByLabelText('Confirme a nova senha'), 'nova-senha-123');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText('Sua nova senha já está valendo.')).toBeInTheDocument();
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'nova-senha-123' });
  });
});

describe('saída e expiração', () => {
  it('"Sair" encerra a sessão deste dispositivo e volta ao login', async () => {
    const user = userEvent.setup();
    const { router, supabase } = renderApp('/');
    await screen.findByText(/ainda está vazio/i);
    const [sidebarButton] = screen.getAllByRole('button', { name: 'Sair da conta' });
    if (!sidebarButton) throw new Error('botão de sair ausente');
    await user.click(sidebarButton);
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.queryByText(/sessão expirou/i)).not.toBeInTheDocument();
  });

  it('se a renovação do token falha, o usuário é levado ao login com aviso', async () => {
    const { router, supabase } = renderApp('/estudos');
    await screen.findByRole('heading', { level: 1, name: 'Estudos' });
    act(() => {
      supabase.emit('SIGNED_OUT', null);
    });
    expect(
      await screen.findByText('Sua sessão expirou. Entre novamente para continuar.'),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe('?redirectTo=%2Festudos');
  });
});
