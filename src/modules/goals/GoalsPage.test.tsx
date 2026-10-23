import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

describe('Metas', () => {
  it('cria meta de horas semanais com unidade canônica e mostra o progresso do servidor', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.db.onRpc('goal_progress', () =>
      supabase.state.db.rows('goals').map((g) => ({
        goal_id: g.id,
        cycle_start: '2026-10-19',
        cycle_end: '2026-10-26',
        current_value: 2.5,
        target_value: g.target_value,
      })),
    );
    renderApp('/metas', { supabase });
    const [button] = await screen.findAllByRole('button', { name: 'Nova meta' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Nova meta' });
    await user.type(within(dialog).getByLabelText('Título'), 'Estudar 10 h');
    await user.type(within(dialog).getByLabelText('Alvo (h)'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Criar meta' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('goals')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('goals')[0]).toMatchObject({
      progress_mode: 'activity_time',
      period: 'weekly',
      unit: 'h',
      target_value: 10,
    });
    await user.keyboard('{Escape}');
    expect(await screen.findByText('2 h 30 min de 10 h')).toBeInTheDocument();
    expect(screen.getByText('Automática')).toBeInTheDocument();
  });

  it('meta manual exige unidade e é sinalizada como manual', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.db.onRpc('goal_progress', () => []);
    renderApp('/metas', { supabase });
    const [button] = await screen.findAllByRole('button', { name: 'Nova meta' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Nova meta' });
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'manual');
    expect(within(dialog).getByText(/Meta MANUAL/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Título'), 'Ler 6 livros');
    await user.type(within(dialog).getByLabelText('Alvo'), '6');
    await user.click(within(dialog).getByRole('button', { name: 'Criar meta' }));
    expect(await within(dialog).findByText('Informe a unidade (ex.: livros).')).toBeInTheDocument();
  });
});
