import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { localDateIn } from '@/lib/date';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

// O perfil de teste está em São Paulo.
const today = () => localDateIn(new Date(), 'America/Sao_Paulo');

describe('Hábitos', () => {
  it('cria um hábito por dias da semana', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    renderApp('/habitos', { supabase });
    const [button] = await screen.findAllByRole('button', { name: 'Novo hábito' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Novo hábito' });
    await user.type(within(dialog).getByLabelText('Nome'), 'Treino');
    await user.selectOptions(within(dialog).getByLabelText('Frequência'), 'weekdays');
    await user.click(within(dialog).getByRole('button', { name: 'Criar hábito' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('habits')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('habits')[0]).toMatchObject({
      name: 'Treino',
      schedule_kind: 'weekdays',
      weekdays: [1, 3, 5],
      times_per_week: null,
    });
  });

  it('marcar, desfazer e nunca duplicar a marcação do dia', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.db.seed('habits', [{ name: 'Meditar', start_on: '2026-01-01' }]);
    renderApp('/habitos', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Marcar Meditar como feito hoje' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('habit_checkins')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('habit_checkins')[0]).toMatchObject({
      local_date: today(),
      value: null,
    });
    // Já marcado: o botão de marcar fica indisponível (sem segundo registro).
    expect(
      await screen.findByRole('button', { name: 'Meditar: corrigir valor de hoje' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Desfazer marcação de Meditar' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('habit_checkins')).toHaveLength(0);
    });
  });

  it('com meta por marcação, corrigir o valor atualiza o mesmo registro', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const [habit] = supabase.state.db.seed('habits', [
      { name: 'Ler', start_on: '2026-01-01', target_value: 20, unit: 'páginas' },
    ]);
    supabase.state.db.seed('habit_checkins', [
      { habit_id: habit?.id, local_date: today(), value: 5 },
    ]);
    renderApp('/habitos', { supabase });
    expect(await screen.findByText(/abaixo da meta/)).toBeInTheDocument();
    const input = screen.getByLabelText('Quantidade de Ler (páginas)');
    await user.clear(input);
    await user.type(input, '25');
    await user.click(screen.getByRole('button', { name: 'Ler: corrigir valor de hoje' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('habit_checkins')[0]?.value).toBe(25);
    });
    expect(supabase.state.db.rows('habit_checkins')).toHaveLength(1);
  });
});
