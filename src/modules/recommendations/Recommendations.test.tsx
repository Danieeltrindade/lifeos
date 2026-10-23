import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, localDateIn } from '@/lib/date';
import { installAnalyticsRpcs } from '@/tests/domain-rpcs';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

const today = localDateIn(new Date(), 'America/Sao_Paulo');

function setup() {
  const supabase = createFakeSupabase();
  installAnalyticsRpcs(supabase.state.db);
  return supabase;
}

describe('Recomendações', () => {
  it('gera por regra, mostra motivo e base, e não duplica ao reavaliar', async () => {
    const supabase = setup();
    supabase.state.db.seed('tasks', [
      { title: 'Pagar inscrição', priority: 'high', due_on: addDays(today, -2) },
    ]);
    const { unmount } = renderApp('/recomendacoes', { supabase });
    expect(await screen.findByRole('heading', { name: '1 tarefa atrasada' })).toBeInTheDocument();
    expect(screen.getByText(/é de prioridade alta/)).toBeInTheDocument();
    expect(screen.getByText('Prioridade alta')).toBeInTheDocument();
    expect(screen.getByText('Pagar inscrição')).toBeInTheDocument(); // evidência
    unmount();

    renderApp('/recomendacoes', { supabase });
    await screen.findByRole('heading', { name: '1 tarefa atrasada' });
    await waitFor(() => {
      expect(
        supabase.state.db.rows('recommendations').filter((r) => r.rule_id === 'task.overdue'),
      ).toHaveLength(1);
    });
  });

  it('aceitar não altera nada; resolver encerra; rejeitar guarda o motivo', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [{ title: 'Atrasada', due_on: addDays(today, -1) }]);
    supabase.state.db.seed('review_cards', [
      { topic_id: 'x', due_on: addDays(today, -3), status: 'active' },
    ]);
    renderApp('/recomendacoes', { supabase });
    const card = (await screen.findByRole('heading', { name: '1 tarefa atrasada' })).closest(
      'article',
    );
    if (!card) throw new Error('sem cartão');
    await user.click(within(card).getByRole('button', { name: 'Aceitar' }));
    await waitFor(() => {
      expect(
        supabase.state.db.rows('recommendations').find((r) => r.rule_id === 'task.overdue')?.status,
      ).toBe('accepted');
    });
    expect(supabase.state.db.rows('tasks')[0]).toMatchObject({ status: 'todo' });

    const reviewCard = screen
      .getByRole('heading', { name: '1 revisão atrasada' })
      .closest('article');
    if (!reviewCard) throw new Error('sem cartão');
    await user.click(within(reviewCard).getByRole('button', { name: 'Rejeitar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rejeitar recomendação?' });
    await user.type(within(dialog).getByLabelText('Motivo (opcional)'), 'Fiz no papel');
    await user.click(within(dialog).getByRole('button', { name: 'Rejeitar' }));
    await waitFor(() => {
      expect(
        supabase.state.db.rows('recommendations').find((r) => r.rule_id === 'review.overdue'),
      ).toMatchObject({ status: 'dismissed', decision_note: 'Fiz no papel' });
    });
  });

  it('adiar move para "Adiadas" com a data', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [{ title: 'Atrasada', due_on: addDays(today, -1) }]);
    renderApp('/recomendacoes', { supabase });
    const card = (await screen.findByRole('heading', { name: '1 tarefa atrasada' })).closest(
      'article',
    );
    if (!card) throw new Error('sem cartão');
    await user.selectOptions(within(card).getByLabelText('Adiar recomendação'), '3');
    await waitFor(() => {
      expect(supabase.state.db.rows('recommendations')[0]?.status).toBe('snoozed');
    });
    const until = String(supabase.state.db.rows('recommendations')[0]?.snoozed_until);
    expect(localDateIn(new Date(until), 'America/Sao_Paulo')).toBe(addDays(today, 3));
    await user.click(screen.getByRole('radio', { name: 'Adiadas' }));
    expect(await screen.findByText(/Adiada até/)).toBeInTheDocument();
  });

  it('sem dados: nenhuma sugestão inventada e o catálogo de regras é explicado', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    renderApp('/recomendacoes', { supabase });
    expect(await screen.findByText('Nenhuma recomendação ativa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Como funcionam as regras' }));
    const dialog = await screen.findByRole('dialog', { name: 'Regras de recomendação' });
    expect(within(dialog).getByText(/sem inteligência artificial/)).toBeInTheDocument();
    expect(within(dialog).getAllByText('Amostra mínima:').length).toBeGreaterThan(0);
  });
});
