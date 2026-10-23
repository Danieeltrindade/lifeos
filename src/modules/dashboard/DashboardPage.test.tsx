import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { localDateIn } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';
import sqlOutput from './data/__fixtures__/dashboard-summary.sql-output.json';
import { emptyDashboard, isDashboardEmpty } from './data/dashboard-repository';
import { parseDashboardSummary } from './data/dashboard-schema';
import { buildDemoAgenda, buildDemoDashboard } from './data/demo-dashboard';

describe('Dashboard — estados', () => {
  it('conta nova: primeiros passos no lugar de cards vazios, sem números inventados', async () => {
    const { supabase } = renderApp('/');
    expect(await screen.findByText(/ainda está vazio/i)).toBeInTheDocument();
    const steps = screen.getByRole('region', { name: /ainda está vazio/i });
    expect(within(steps).getByRole('link', { name: /Cadastre uma matéria/ })).toHaveAttribute(
      'href',
      '/estudos',
    );
    expect(within(steps).getByRole('link', { name: /Crie uma tarefa/ })).toHaveAttribute(
      'href',
      '/tarefas',
    );
    expect(screen.queryByRole('region', { name: 'Agenda de hoje' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Estudos' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dados fictícios')).not.toBeInTheDocument();
    expect(screen.queryByText(/modo de inspeção/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(supabase.rpc).toHaveBeenCalledWith(
      'dashboard_summary',
      expect.objectContaining({ p_now: expect.any(String) as string }),
    );
  });

  it('dados reais: resumo do Postgres + agenda do calendário no fuso do perfil', async () => {
    const supabase = createFakeSupabase();
    supabase.state.rpc.dashboard_summary = () => Promise.resolve({ data: sqlOutput, error: null });
    const today = localDateIn(new Date(), 'America/Sao_Paulo');
    supabase.state.db.seed('calendar_events', [
      {
        title: 'Bloco de cálculo',
        kind: 'study',
        starts_at: zonedToUtc(today, '14:00', 'America/Sao_Paulo').toISOString(),
        ends_at: zonedToUtc(today, '16:00', 'America/Sao_Paulo').toISOString(),
      },
      // Série diária iniciada no passado: aparece hoje (recorrência expandida na interface).
      {
        title: 'Leitura da noite',
        kind: 'habit',
        starts_at: zonedToUtc('2026-01-01', '21:00', 'America/Sao_Paulo').toISOString(),
        ends_at: zonedToUtc('2026-01-01', '21:30', 'America/Sao_Paulo').toISOString(),
        recurrence_rule: 'FREQ=DAILY',
      },
    ]);
    renderApp('/', { supabase });

    const agenda = await screen.findByRole('region', { name: 'Agenda de hoje' });
    // Horários exibidos em America/Sao_Paulo, independentemente do fuso do ambiente de teste.
    expect(await within(agenda).findByText('14:00')).toBeInTheDocument();
    expect(within(agenda).getByText('Leitura da noite')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: /realizado em relação ao planejado/i }),
    ).toHaveAttribute('aria-valuetext', '2 h 20 min de 2 h');
    expect(screen.getByText('Ler 6 livros')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Projetos ativos' })).toHaveTextContent(
      '1 de 2 tarefas',
    );
    expect(screen.queryByText('Dados fictícios')).not.toBeInTheDocument();
  });

  it('editar algo em outro módulo atualiza o dashboard (cache invalidado)', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    let calls = 0;
    supabase.state.rpc.dashboard_summary = () => {
      calls += 1;
      return Promise.resolve({ data: sqlOutput, error: null });
    };
    renderApp('/', { supabase });
    await screen.findByRole('region', { name: 'Tarefas prioritárias' });
    expect(calls).toBe(1);
    await user.click(screen.getByRole('link', { name: /Nova tarefa/ }));
    const [button] = await screen.findAllByRole('button', { name: 'Nova tarefa' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Nova tarefa' });
    await user.type(within(dialog).getByLabelText('Título'), 'Nova');
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));
    await screen.findByRole('dialog', { name: 'Nova' });
    await user.keyboard('{Escape}');
    await user.click(screen.getAllByRole('link', { name: /^Dashboard/ })[0] ?? document.body);
    await screen.findByRole('region', { name: 'Tarefas prioritárias' });
    expect(calls).toBeGreaterThan(1);
  });

  it('modo demonstração (desenvolvimento): identifica os dados como fictícios', async () => {
    renderApp('/', { dataSource: 'demo' });
    expect(await screen.findByText('Dados fictícios')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/fictícios/i);
    expect(screen.getByText('Entregar capítulo 2 do TCC')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: /realizado em relação ao planejado/i }),
    ).toHaveAttribute('aria-valuetext', '1 h 25 min de 1 h 30 min');
  });

  it('falha de conexão: alerta com mensagem compreensível e nova tentativa', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    let calls = 0;
    supabase.state.rpc.dashboard_summary = () => {
      calls += 1;
      // Falhas de rede são repetidas uma vez automaticamente; as duas primeiras falham.
      return calls <= 2
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve({ data: { origin: 'user', bad: true }, error: null });
    };
    renderApp('/', { supabase });
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent(/não foi possível carregar/i);
    expect(alert).toHaveTextContent(/sem conexão com o servidor/i);

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
    // Segunda resposta fora do contrato: erro explícito, nunca uma tela quebrada.
    expect(await screen.findByRole('alert')).toHaveTextContent(/formato inesperado/i);
  });

  it('sessão expirada no servidor: encerra a sessão e leva ao login com aviso', async () => {
    const supabase = createFakeSupabase();
    supabase.state.rpc.dashboard_summary = () =>
      Promise.resolve({
        data: null,
        error: { code: 'PGRST303', message: 'JWT expired', status: 401 },
      });
    const { router } = renderApp('/', { supabase });
    expect(await screen.findByText(/sua sessão expirou/i)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('carregamento: exibe esqueleto acessível', async () => {
    renderApp('/', { dataSource: 'simulate-slow' });
    expect(await screen.findByText(/carregando dashboard/i)).toBeInTheDocument();
  });
});

describe('contrato banco ↔ interface', () => {
  it('o JSON REAL produzido por public.dashboard_summary passa na validação', () => {
    const summary = parseDashboardSummary(sqlOutput);
    expect(summary.studies.actualMinutesToday).toBe(140);
    expect(summary.timezone).toBe('America/Sao_Paulo');
    expect(summary.goals.map((g) => g.progressMode).sort()).toEqual(['activity_time', 'manual']);
    expect(summary.activeProjects).toHaveLength(1);
    expect(summary.setup.tasks).toBe(11);
  });

  it('rejeita respostas fora do contrato', () => {
    expect(() => parseDashboardSummary({ ...sqlOutput, origin: 'demo' })).toThrow();
    expect(() => parseDashboardSummary({ ...sqlOutput, studies: {} })).toThrow();
  });
});

describe('regras do resumo', () => {
  it('resumo vazio é reconhecido como vazio', () => {
    expect(isDashboardEmpty(emptyDashboard())).toBe(true);
  });

  it('dados de demonstração são sempre marcados com origem "demo"', () => {
    const demo = buildDemoDashboard(new Date());
    expect(demo.origin).toBe('demo');
    expect(isDashboardEmpty(demo)).toBe(false);
  });

  it('a agenda de demonstração é separada do resumo (planejado ≠ realizado)', () => {
    const agenda = buildDemoAgenda(new Date());
    expect(agenda.length).toBeGreaterThan(0);
    expect(buildDemoDashboard(new Date())).not.toHaveProperty('agenda');
  });
});
