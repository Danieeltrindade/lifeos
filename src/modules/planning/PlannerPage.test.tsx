import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { installAnalyticsRpcs } from '@/tests/domain-rpcs';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

function setup() {
  const supabase = createFakeSupabase();
  installAnalyticsRpcs(supabase.state.db);
  // Disponível todos os dias, o dia inteiro: o plano sempre encontra horário.
  supabase.state.db.seed(
    'availability_windows',
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      start_time: '00:00:00',
      end_time: '24:00:00',
    })),
  );
  return supabase;
}

describe('Planejamento adaptativo', () => {
  it('propõe blocos explicados e só cria após confirmação', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [
      { title: 'Relatório', estimate_minutes: 60, priority: 'high' },
    ]);
    renderApp('/calendario/planejar', { supabase });
    // Perto da meia-noite o bloco pode ser dividido em dois dias; o total é o que importa.
    expect(await screen.findByText(/^Sugestão: [12] bloco\(s\)$/)).toBeInTheDocument();
    expect(screen.getByText(/não é necessariamente o melhor plano/)).toBeInTheDocument();
    const [why] = screen.getAllByText('Por que este horário?');
    if (!why) throw new Error('sem explicação');
    await user.click(why);
    expect(screen.getAllByText(/Prioridade alta, sem prazo/).length).toBeGreaterThan(0);
    expect(supabase.state.db.rows('calendar_events')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /^Criar [12] bloco/ }));
    const dialog = await screen.findByRole('dialog', { name: /Criar [12] bloco/ });
    await user.click(within(dialog).getByRole('button', { name: 'Criar blocos' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('calendar_events').length).toBeGreaterThan(0);
    });
    const blocks = supabase.state.db.rows('calendar_events');
    expect(blocks.every((b) => b.kind === 'task' && b.title === 'Relatório')).toBe(true);
    const minutes = blocks.reduce(
      (s, b) => s + (Date.parse(String(b.ends_at)) - Date.parse(String(b.starts_at))) / 60_000,
      0,
    );
    expect(minutes).toBe(60);
    expect(supabase.state.db.rows('tasks')[0]).toMatchObject({ status: 'todo' });
  });

  it('descartar não cria nada; desmarcar exclui o bloco da criação', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [
      { title: 'A', estimate_minutes: 30 },
      { title: 'B', estimate_minutes: 30 },
    ]);
    renderApp('/calendario/planejar', { supabase });
    await screen.findByText(/^Sugestão: \d bloco\(s\)$/);
    const before = screen.getAllByRole('checkbox', { name: /Tarefa:/ }).length;
    const [first] = screen.getAllByRole('checkbox', { name: /Tarefa: A/ });
    if (!first) throw new Error('sem bloco');
    await user.click(first);
    expect(
      screen.getByRole('button', { name: `Criar ${String(before - 1)} bloco(s)` }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar plano' }));
    expect(screen.getByText('Plano descartado. Nada foi criado.')).toBeInTheDocument();
    expect(supabase.state.db.rows('calendar_events')).toHaveLength(0);
  });

  it('tarefa sem estimativa fica fora do plano, com o motivo', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [{ title: 'Sem tempo', estimate_minutes: null }]);
    renderApp('/calendario/planejar', { supabase });
    await user.click(await screen.findByText('1 item(ns) fora do plano'));
    expect(screen.getByText(/Sem tempo: Sem estimativa de duração/)).toBeInTheDocument();
  });

  it('sem disponibilidade pede para definir as janelas', async () => {
    const supabase = createFakeSupabase();
    installAnalyticsRpcs(supabase.state.db);
    supabase.state.db.seed('tasks', [{ title: 'X', estimate_minutes: 30 }]);
    renderApp('/calendario/planejar', { supabase });
    expect(await screen.findByText('Defina sua disponibilidade')).toBeInTheDocument();
  });
});

describe('Planejamento sem disponibilidade', () => {
  it('explica uma vez a causa comum, sem dizer que não há o que planejar', async () => {
    const supabase = createFakeSupabase();
    installAnalyticsRpcs(supabase.state.db);
    supabase.state.db.seed('tasks', [
      { title: 'A', estimate_minutes: 30 },
      { title: 'B', estimate_minutes: 45 },
    ]);
    renderApp('/calendario/planejar', { supabase });
    expect(
      await screen.findByText(
        'Nada a propor ainda: 2 itens esperam horário, mas não há janelas de disponibilidade.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Motivo comum: nenhuma janela de disponibilidade/)).toBeInTheDocument();
    expect(screen.queryByText(/Alternativas:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/não há tarefas abertas com estimativa/)).not.toBeInTheDocument();
  });
});
