import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { installAnalyticsRpcs, installDomainRpcs, taskRow } from '@/tests/domain-rpcs';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

function firstButton(name: string): HTMLElement {
  const [button] = screen.getAllByRole('button', { name });
  if (!button) throw new Error(`Botão não encontrado: ${name}`);
  return button;
}

function setup() {
  const supabase = createFakeSupabase();
  installDomainRpcs(supabase.state.db);
  return supabase;
}

describe('Tarefas', () => {
  it('estado vazio convida a criar e a tarefa criada aparece na lista', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    renderApp('/tarefas', { supabase });
    expect(await screen.findByText('Nenhuma tarefa ainda')).toBeInTheDocument();

    await user.click(firstButton('Nova tarefa'));
    const dialog = await screen.findByRole('dialog', { name: 'Nova tarefa' });
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));
    expect(await within(dialog).findByText('Informe o título.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Título'), 'Ler capítulo 3');
    await user.type(within(dialog).getByLabelText('Início'), '2026-10-25');
    await user.type(within(dialog).getByLabelText('Prazo'), '2026-10-20');
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));
    expect(
      await within(dialog).findByText('O prazo não pode ser antes da data de início.'),
    ).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Prazo'));
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));

    expect(await screen.findByRole('dialog', { name: 'Ler capítulo 3' })).toBeInTheDocument();
    expect(supabase.state.db.rows('tasks')).toHaveLength(1);
    expect(supabase.state.db.rows('tasks')[0]).toMatchObject({
      title: 'Ler capítulo 3',
      start_on: '2026-10-25',
      due_on: null,
    });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('button', { name: 'Ler capítulo 3' })).toBeInTheDocument();
  });

  it('concluir pela lista grava no banco e a tarefa sai das abertas', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [taskRow({ title: 'Enviar relatório' })]);
    renderApp('/tarefas', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Concluir “Enviar relatório”' }));
    expect(await screen.findByText('Tarefa concluída.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Enviar relatório' })).not.toBeInTheDocument();
    });
    expect(supabase.state.db.rows('tasks')[0]?.status).toBe('done');
  });

  it('dependência aberta impede concluir e explica por quê', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const [first, second] = supabase.state.db.seed('tasks', [
      taskRow({ title: 'Coletar dados' }),
      taskRow({ title: 'Analisar dados' }),
    ]);
    supabase.state.db.seed('task_dependencies', [
      { task_id: second?.id, depends_on_task_id: first?.id },
    ]);
    renderApp('/tarefas', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Concluir “Analisar dados”' }));
    expect(await screen.findByText('Conclua antes: Coletar dados.')).toBeInTheDocument();
    expect(supabase.state.db.rows('tasks')[1]?.status).toBe('todo');
  });

  it('mãe com subtarefas abertas pede confirmação e nunca conclui sozinha', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const [parent] = supabase.state.db.seed('tasks', [taskRow({ title: 'TCC' })]);
    supabase.state.db.seed('tasks', [taskRow({ title: 'Introdução', parent_task_id: parent?.id })]);
    renderApp('/tarefas', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Concluir “TCC”' }));
    const confirm = await screen.findByRole('dialog', { name: 'Concluir com subtarefas?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(supabase.state.db.rows('tasks').every((t) => t.status === 'todo')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Concluir “TCC”' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Concluir com subtarefas?' })).getByRole(
        'button',
        { name: 'Concluir tarefa e 1 subtarefa' },
      ),
    );
    await waitFor(() => {
      expect(supabase.state.db.rows('tasks').every((t) => t.status === 'done')).toBe(true);
    });
  });

  it('falha de rede ao carregar mostra erro com nova tentativa', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.failNext('tasks');
    supabase.state.db.failNext('tasks');
    supabase.state.db.seed('tasks', [taskRow({ title: 'Recuperada' })]);
    renderApp('/tarefas', { supabase });
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent(/sem conexão/i);
    await user.click(within(alert).getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByRole('button', { name: 'Recuperada' })).toBeInTheDocument();
  });

  it('erro ao salvar mantém o formulário aberto e avisa', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    renderApp('/tarefas', { supabase });
    await screen.findByText('Nenhuma tarefa ainda');
    await user.click(firstButton('Nova tarefa'));
    const dialog = await screen.findByRole('dialog', { name: 'Nova tarefa' });
    await user.type(within(dialog).getByLabelText('Título'), 'Sem rede');
    supabase.state.db.failNext('tasks');
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));
    expect(await screen.findByText(/sem conexão/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Título')).toHaveValue('Sem rede');
  });

  it('excluir pede confirmação e remove do banco', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [taskRow({ title: 'Rascunho' })]);
    renderApp('/tarefas', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Rascunho' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rascunho' });
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    const confirm = await screen.findByRole('dialog', { name: 'Excluir tarefa?' });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir tarefa' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('tasks')).toHaveLength(0);
    });
    expect(await screen.findByText('Nenhuma tarefa ainda')).toBeInTheDocument();
  });

  it('atrasadas são destacadas sem mudar o status', async () => {
    const supabase = setup();
    supabase.state.db.seed('tasks', [taskRow({ title: 'Antiga', due_on: '2020-01-10' })]);
    renderApp('/tarefas', { supabase });
    expect(await screen.findByText(/Atrasada · 10 de jan/)).toBeInTheDocument();
    expect(supabase.state.db.rows('tasks')[0]?.status).toBe('todo');
  });

  it('visão Kanban mostra as quatro colunas', async () => {
    const supabase = setup();
    supabase.state.db.seed('tasks', [
      taskRow({ title: 'A fazer 1' }),
      taskRow({ title: 'Feita 1', status: 'done', completed_at: '2026-10-01T10:00:00Z' }),
    ]);
    renderApp('/tarefas?visao=kanban', { supabase });
    for (const name of ['A fazer', 'Em andamento', 'Concluída', 'Cancelada']) {
      expect(
        await screen.findByRole('region', { name: new RegExp(`^${name}`) }),
      ).toBeInTheDocument();
    }
    expect(
      within(screen.getByRole('region', { name: /^Concluída/ })).getByText('Feita 1'),
    ).toBeInTheDocument();
  });

  it('detalhe mostra estimado, planejado e realizado sem concluir a tarefa', async () => {
    const supabase = setup();
    installAnalyticsRpcs(supabase.state.db);
    const [goal] = supabase.state.db.seed('goals', [
      {
        title: 'Entregas do mês',
        progress_mode: 'tasks_completed',
        target_value: 3,
        unit: 'tarefas',
      },
    ]);
    const [task] = supabase.state.db.seed('tasks', [
      { title: 'Relatório', estimate_minutes: 60, goal_id: goal?.id },
    ]);
    supabase.state.db.seed('activities', [
      {
        title: 'Relatório',
        kind: 'work',
        task_id: task?.id,
        started_at: '2026-10-20T12:00:00Z',
        ended_at: '2026-10-20T13:30:00Z',
        duration_seconds: 5400,
      },
    ]);
    supabase.state.db.seed('calendar_events', [
      {
        title: 'Bloco',
        kind: 'task',
        task_id: task?.id,
        starts_at: new Date(Date.now() + 3_600_000).toISOString(),
        ends_at: new Date(Date.now() + 5_400_000).toISOString(),
      },
    ]);
    renderApp(`/tarefas?tarefa=${String(task?.id)}`, { supabase });
    const section = (
      await screen.findByRole('heading', { name: 'Tempo: estimado, planejado e realizado' })
    ).closest('section');
    if (!section) throw new Error('sem seção');
    await waitFor(() => {
      expect(within(section).getByText('1 h 30 min')).toBeInTheDocument();
    });
    expect(within(section).getByText('+30 min')).toBeInTheDocument();
    expect(within(section).getByText('30 min ainda por vir')).toBeInTheDocument();
    expect(screen.getByText('Meta: Entregas do mês')).toBeInTheDocument();
    expect(supabase.state.db.rows('tasks')[0]?.status).toBe('todo');
  });
});
