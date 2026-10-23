import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { installDomainRpcs, taskRow } from '@/tests/domain-rpcs';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

function setup() {
  const supabase = createFakeSupabase();
  installDomainRpcs(supabase.state.db);
  return supabase;
}

describe('Projetos', () => {
  it('cria um projeto e abre o detalhe', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const { router } = renderApp('/projetos', { supabase });
    expect(await screen.findByText('Nenhum projeto ainda')).toBeInTheDocument();
    const [button] = screen.getAllByRole('button', { name: 'Novo projeto' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Novo projeto' });
    await user.type(within(dialog).getByLabelText('Nome'), 'TCC');
    await user.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'TCC' })).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/projetos\/.+/);
  });

  it('progresso é calculado das tarefas (canceladas fora da conta)', async () => {
    const supabase = setup();
    const [project] = supabase.state.db.seed('projects', [{ name: 'Mudança' }]);
    supabase.state.db.seed('tasks', [
      taskRow({
        title: 'Caixas',
        project_id: project?.id,
        status: 'done',
        completed_at: '2026-10-01T10:00:00Z',
      }),
      taskRow({ title: 'Transporte', project_id: project?.id }),
      taskRow({
        title: 'Pintura',
        project_id: project?.id,
        status: 'cancelled',
        cancelled_at: '2026-10-01T10:00:00Z',
      }),
    ]);
    renderApp(`/projetos/${String(project?.id)}`, { supabase });
    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/1 canceladas fora da conta/)).toBeInTheDocument();
    expect(screen.getByText(/Não é um percentual digitado/)).toBeInTheDocument();
  });

  it('marcos: adicionar e marcar como atingido', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const [project] = supabase.state.db.seed('projects', [{ name: 'Site' }]);
    renderApp(`/projetos/${String(project?.id)}`, { supabase });
    await user.type(await screen.findByLabelText('Novo marco'), 'Protótipo aprovado');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Marcar marco Protótipo aprovado como atingido',
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(supabase.state.db.rows('project_milestones')[0]?.completed_at).not.toBeNull();
    });
  });

  it('excluir mantém as tarefas (sem projeto) e volta à lista', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const [project] = supabase.state.db.seed('projects', [{ name: 'Velho' }]);
    supabase.state.db.seed('tasks', [taskRow({ title: 'Fica', project_id: project?.id })]);
    const { router } = renderApp(`/projetos/${String(project?.id)}`, { supabase });
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    const confirm = await screen.findByRole('dialog', { name: 'Excluir projeto?' });
    expect(confirm).toHaveTextContent('1 tarefa continua existindo, sem projeto');
    await user.click(within(confirm).getByRole('button', { name: 'Excluir projeto' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projetos');
    });
    expect(supabase.state.db.rows('projects')).toHaveLength(0);
    expect(supabase.state.db.rows('tasks')).toHaveLength(1);
  });

  it('meta ligada impede a exclusão com mensagem clara', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const [project] = supabase.state.db.seed('projects', [{ name: 'Com meta' }]);
    renderApp(`/projetos/${String(project?.id)}`, { supabase });
    const deleteButton = await screen.findByRole('button', { name: 'Excluir' });
    supabase.state.db.failNext('projects', {
      code: '23503',
      message:
        'update or delete on table "projects" violates foreign key constraint "goals_project_fk" on table "goals"',
    });
    await user.click(deleteButton);
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Excluir projeto?' })).getByRole('button', {
        name: 'Excluir projeto',
      }),
    );
    expect(await screen.findByText(/Há metas ligadas a este projeto/)).toBeInTheDocument();
    expect(supabase.state.db.rows('projects')).toHaveLength(1);
  });
});
