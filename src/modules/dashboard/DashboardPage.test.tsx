import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/tests/render-app';
import { buildDemoDashboard } from './data/demo-dashboard';
import { emptyDashboard, isDashboardEmpty } from './data/dashboard-repository';

describe('Dashboard — estados', () => {
  it('sem backend: mostra estado vazio real, sem números inventados', async () => {
    renderApp('/', { dataSource: 'none' });
    expect(await screen.findByText(/ainda está vazio/i)).toBeInTheDocument();
    expect(screen.getByText('Nada planejado para hoje')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma sessão registrada')).toBeInTheDocument();
    expect(screen.getByText('Ainda sem histórico suficiente')).toBeInTheDocument();
    expect(screen.queryByText('Dados fictícios')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('modo demonstração: identifica os dados como fictícios', async () => {
    renderApp('/', { dataSource: 'demo' });
    expect(await screen.findByText('Dados fictícios')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/fictícios/i);
    expect(screen.getByText('Entregar capítulo 2 do TCC')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: /realizado em relação ao planejado/i }),
    ).toHaveAttribute('aria-valuetext', '1 h 25 min de 2 h 30 min');
  });

  it('erro: exibe alerta com ação de nova tentativa', async () => {
    const user = userEvent.setup();
    renderApp('/', { dataSource: 'simulate-error' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível carregar/i);
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/carregando dashboard/i)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('carregamento: exibe esqueleto acessível', () => {
    renderApp('/', { dataSource: 'simulate-slow' });
    expect(screen.getByText(/carregando dashboard/i)).toBeInTheDocument();
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

  it('demonstração mantém planejado e realizado como valores distintos', () => {
    const { studies } = buildDemoDashboard(new Date());
    expect(studies.plannedMinutesToday).not.toBe(studies.actualMinutesToday);
  });
});
