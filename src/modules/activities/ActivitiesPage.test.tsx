import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

describe('Atividades', () => {
  it('formulário por tipo: leitura grava páginas e limpa métricas de outros tipos', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    renderApp('/atividades', { supabase });
    const [button] = await screen.findAllByRole('button', { name: 'Nova atividade' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Nova atividade' });
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'exercise');
    await user.type(within(dialog).getByLabelText('Distância (km)'), '5');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'reading');
    expect(within(dialog).queryByLabelText('Distância (km)')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Título'), 'Leitura noturna');
    await user.type(within(dialog).getByLabelText('Páginas lidas'), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar atividade' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('activities')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('activities')[0]).toMatchObject({
      kind: 'reading',
      pages: 30,
      distance_km: null,
      subject_id: null,
    });
  });

  it('fim antes do início é recusado antes de enviar', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    renderApp('/atividades', { supabase });
    const [button] = await screen.findAllByRole('button', { name: 'Nova atividade' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Nova atividade' });
    await user.type(within(dialog).getByLabelText('Título'), 'Erro');
    const end = within(dialog).getByLabelText('Fim');
    await user.clear(end);
    await user.type(end, '2020-01-01T10:00');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar atividade' }));
    expect(
      await within(dialog).findByText('O fim precisa ser depois do início.'),
    ).toBeInTheDocument();
    expect(supabase.state.db.rows('activities')).toHaveLength(0);
  });

  it('excluir uma atividade do cronômetro exclui a sessão de origem', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const now = Date.now();
    const [session] = supabase.state.db.seed('focus_sessions', [
      {
        status: 'completed',
        started_at: new Date(now - 7200_000).toISOString(),
        ended_at: new Date(now - 3600_000).toISOString(),
      },
    ]);
    supabase.state.db.seed('activities', [
      {
        title: 'Sessão de foco',
        kind: 'study',
        source: 'timer',
        session_id: session?.id,
        started_at: session?.started_at,
        ended_at: session?.ended_at,
        duration_seconds: 3600,
      },
    ]);
    renderApp('/atividades', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Excluir Sessão de foco' }));
    const confirm = await screen.findByRole('dialog', { name: 'Excluir atividade?' });
    expect(confirm).toHaveTextContent(/sessão de foco correspondente/);
    await user.click(within(confirm).getByRole('button', { name: 'Excluir atividade' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('focus_sessions')).toHaveLength(0);
    });
  });
});
