import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

describe('Diário', () => {
  it('escreve a entrada de hoje, busca e mantém a privacidade explícita', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.db.seed('diary_entries', [
      {
        local_date: '2026-10-01',
        title: 'Viagem',
        content: 'Praia com a família',
        mood: 5,
        energy: 4,
      },
    ]);
    renderApp('/diario', { supabase });
    expect(await screen.findByText(/só a sua conta lê estas entradas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Escrever hoje' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova entrada' });
    await user.type(within(dialog).getByLabelText('Texto'), 'Dia produtivo de estudos');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar entrada' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('diary_entries')).toHaveLength(2);
    });
    await user.type(screen.getByLabelText('Buscar no diário'), 'praia');
    expect(await screen.findByText('Viagem')).toBeInTheDocument();
    expect(screen.queryByText('Dia produtivo de estudos')).not.toBeInTheDocument();
  });

  it('não permite duas entradas no mesmo dia', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.db.seed('diary_entries', [
      { local_date: '2026-10-01', title: null, content: 'a' },
    ]);
    renderApp('/diario', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Escrever hoje' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova entrada' });
    const date = within(dialog).getByLabelText('Data');
    await user.clear(date);
    await user.type(date, '2026-10-01');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar entrada' }));
    expect(await within(dialog).findByText(/Já existe uma entrada nesse dia/)).toBeInTheDocument();
  });
});
