import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('Notas', () => {
  it('sem categorias, convida a criar uma — com cor e subcategoria', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    renderApp('/notas', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' });
    await user.type(within(dialog).getByLabelText('Nome'), 'Ideias');
    await user.click(within(dialog).getByRole('button', { name: 'Roxo' }));
    await user.type(within(dialog).getByLabelText('Nova subcategoria'), 'Apps{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Criar categoria' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('note_categories')).toHaveLength(2);
    });
    const rows = supabase.state.db.rows('note_categories');
    const root = rows.find((r) => r.parent_id === null);
    expect(root).toMatchObject({ name: 'Ideias', color: '#a157e8' });
    expect(rows.find((r) => r.parent_id !== null)).toMatchObject({
      name: 'Apps',
      parent_id: root?.id,
    });
  });

  it('lista, filtra por categoria e busca em todas as notas', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const [ideias, frases] = supabase.state.db.seed('note_categories', [
      { name: 'Ideias' },
      { name: 'Frases', position: 1 },
    ]);
    supabase.state.db.seed('notes', [
      {
        category_id: ideias?.id,
        title: 'App de receitas',
        content: doc('Sugere pratos com o que tem na geladeira'),
        content_text: 'Sugere pratos com o que tem na geladeira',
      },
      {
        category_id: frases?.id,
        title: null,
        content: doc('A coragem não é ausência de medo'),
        content_text: 'A coragem não é ausência de medo',
      },
    ]);
    renderApp('/notas', { supabase });
    expect(await screen.findByRole('link', { name: 'App de receitas' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'A coragem não é ausência de medo' }),
    ).toBeInTheDocument();

    const panel = screen.getByRole('complementary', { name: 'Categorias' });
    await user.click(within(panel).getByRole('button', { name: /^Frases/ }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'App de receitas' })).not.toBeInTheDocument();
    });

    // A busca ignora a categoria escolhida e os acentos.
    await user.type(screen.getByLabelText('Buscar em todas as notas'), 'geladeira');
    expect(await screen.findByRole('link', { name: 'App de receitas' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'A coragem não é ausência de medo' }),
    ).not.toBeInTheDocument();
  });

  it('fixar leva a nota ao topo e grava no banco', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const [ideias] = supabase.state.db.seed('note_categories', [{ name: 'Ideias' }]);
    supabase.state.db.seed('notes', [
      { category_id: ideias?.id, title: 'Primeira', content_text: 'a' },
    ]);
    renderApp('/notas', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Fixar no topo' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('notes')[0]).toMatchObject({ pinned: true });
    });
  });

  it('excluir categoria com notas exige escolher para onde movê-las', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const [ideias, frases] = supabase.state.db.seed('note_categories', [
      { name: 'Ideias' },
      { name: 'Frases', position: 1 },
    ]);
    supabase.state.db.seed('notes', [{ category_id: ideias?.id, title: 'Uma', content_text: 'x' }]);
    renderApp('/notas', { supabase });
    const panel = await screen.findByRole('complementary', { name: 'Categorias' });
    await user.click(within(panel).getByRole('button', { name: 'Excluir Ideias' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir categoria' });
    const confirm = within(dialog).getByRole('button', { name: 'Mover notas e excluir' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Mover a nota para'), 'Frases');
    await user.click(confirm);
    await waitFor(() => {
      expect(supabase.state.db.rows('note_categories')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('notes')[0]).toMatchObject({ category_id: frases?.id });
  });

  it('o editor grava o título automaticamente', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const [ideias] = supabase.state.db.seed('note_categories', [{ name: 'Ideias' }]);
    const [n] = supabase.state.db.seed('notes', [
      { category_id: ideias?.id, title: 'Rascunho', content: doc('texto'), content_text: 'texto' },
    ]);
    renderApp(`/notas/${String(n?.id)}`, { supabase });
    const title = await screen.findByPlaceholderText('Título (opcional)');
    expect(title).toHaveValue('Rascunho');
    expect(screen.getByRole('textbox', { name: 'Texto da nota' })).toHaveTextContent('texto');
    await user.clear(title);
    await user.type(title, 'Lugares para ir');
    await waitFor(
      () => {
        expect(supabase.state.db.rows('notes')[0]).toMatchObject({
          title: 'Lugares para ir',
          content_text: 'texto',
        });
      },
      { timeout: 3000 },
    );
    expect(await screen.findByText('Salvo')).toBeInTheDocument();
  });

  it('banco sem as tabelas das Notas: explica como ativar, sem erro genérico', async () => {
    const supabase = createFakeSupabase();
    const original = supabase.from.getMockImplementation();
    if (!original) throw new Error('sem implementação');
    // Resposta do PostgREST quando a tabela não existe (migration não aplicada).
    const missing: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'then'
            ? (ok: (v: unknown) => unknown) =>
                Promise.resolve({
                  data: null,
                  error: { code: 'PGRST205', message: 'Could not find the table' },
                }).then(ok)
            : () => missing,
      },
    );
    supabase.from.mockImplementation((table: string) =>
      table.startsWith('note') ? (missing as never) : original(table),
    );
    renderApp('/notas', { supabase });
    expect(
      await screen.findByRole('heading', {
        name: 'As Notas ainda não foram ativadas no seu banco de dados',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('npm run db:push')).toBeInTheDocument();
    expect(screen.queryByText(/Algo deu errado/)).not.toBeInTheDocument();
  });
});
