import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, localDateIn } from '@/lib/date';
import { startOfWeek, zonedToUtc } from '@/lib/zoned';
import { installAnalyticsRpcs } from '@/tests/domain-rpcs';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

const TZ = 'America/Sao_Paulo';
const today = localDateIn(new Date(), TZ);
const at = (day: string, time: string) => zonedToUtc(day, time, TZ).toISOString();

function setup() {
  const supabase = createFakeSupabase();
  installAnalyticsRpcs(supabase.state.db);
  return supabase;
}

describe('Análises', () => {
  it('mostra o tempo de estudo do período a partir dos registros e explica o cálculo', async () => {
    const supabase = setup();
    supabase.state.db.seed('activities', [
      {
        title: 'Cálculo',
        kind: 'study',
        started_at: at(today, '08:00'),
        ended_at: at(today, '09:30'),
        duration_seconds: 5400,
      },
    ]);
    renderApp('/analises?periodo=day', { supabase });
    expect((await screen.findAllByText('1 h 30 min')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tempo de estudo').length).toBeGreaterThan(0);
    // Comparação sem base anterior: nunca um percentual inventado.
    expect(screen.getAllByText(/sem base no período anterior/).length).toBeGreaterThan(0);
    expect(screen.getByText('Como estes números são calculados')).toBeInTheDocument();
    // Tabela equivalente ao gráfico.
    expect(screen.getByRole('table', { name: 'Tempo de estudo por dia' })).toBeInTheDocument();
  });

  it('período vazio mostra estado vazio, não zeros enganosos', async () => {
    const supabase = setup();
    renderApp('/analises?periodo=week', { supabase });
    expect(await screen.findByText('Nenhum estudo registrado neste período')).toBeInTheDocument();
    expect(screen.getByText('Sem questões informadas nas reflexões')).toBeInTheDocument();
  });

  it('o período fica na URL e acompanha a troca de aba', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const { router } = renderApp('/analises', { supabase });
    await screen.findAllByText('Tempo de estudo');
    await user.selectOptions(screen.getByLabelText('Período'), 'month');
    await waitFor(() => {
      expect(router.state.location.search).toContain('periodo=month');
    });
    await user.click(screen.getByRole('link', { name: 'Tarefas e projetos' }));
    expect(router.state.location.pathname).toBe('/analises/tarefas');
    expect(router.state.location.search).toContain('periodo=month');
    expect((await screen.findAllByText('Prazos cumpridos')).length).toBeGreaterThan(0);
  });

  it('tarefas: estimado × realizado usa o tempo registrado na tarefa', async () => {
    const supabase = setup();
    const [task] = supabase.state.db.seed('tasks', [
      {
        title: 'Relatório',
        status: 'done',
        estimate_minutes: 60,
        completed_at: at(today, '10:00'),
        due_on: today,
      },
    ]);
    supabase.state.db.seed('activities', [
      {
        title: 'Relatório',
        kind: 'work',
        task_id: task?.id,
        started_at: at(today, '08:00'),
        ended_at: at(today, '09:30'),
        duration_seconds: 5400,
      },
    ]);
    renderApp('/analises/tarefas?periodo=day', { supabase });
    expect(await screen.findByText('1,5×')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Estimado e realizado por tarefa' });
    expect(within(table).getByText('+30 min')).toBeInTheDocument();
  });
});

describe('Revisão semanal', () => {
  it('salva anotações e prioridades sem alterar tarefas', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('tasks', [{ title: 'Revisar TCC' }]);
    renderApp('/analises/semana', { supabase });
    const notes = await screen.findByLabelText(/O que funcionou/);
    await user.type(notes, 'Semana corrida.');
    await user.selectOptions(screen.getByLabelText(/Vincular a uma tarefa/), 'Revisar TCC');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await user.type(screen.getByLabelText('Nova prioridade'), 'Dormir mais cedo');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await user.click(screen.getByRole('button', { name: 'Subir Dormir mais cedo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('weekly_review_priorities')).toHaveLength(2);
    });
    const week = startOfWeek(today, 1);
    expect(supabase.state.db.rows('weekly_reviews')).toMatchObject([
      { week_start: week, notes: 'Semana corrida.' },
    ]);
    expect(
      supabase.state.db.rows('weekly_review_priorities').map((p) => [p.position, p.title]),
    ).toEqual([
      [0, 'Dormir mais cedo'],
      [1, 'Revisar TCC'],
    ]);
    expect(supabase.state.db.rows('tasks')[0]?.status).toBe('todo');
  });

  it('navega entre semanas pela URL', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const { router } = renderApp('/analises/semana', { supabase });
    await screen.findAllByText('Planejado em blocos');
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(router.state.location.search).toContain(`semana=${addDays(startOfWeek(today, 1), -7)}`);
  });
});

describe('Análises — metas e hábitos', () => {
  it('compara a consistência com o período anterior em pontos percentuais', async () => {
    const supabase = setup();
    const [habit] = supabase.state.db.seed('habits', [
      { name: 'Ler', schedule_kind: 'daily', start_on: '2026-08-01' },
    ]);
    const days = (from: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ habit_id: habit?.id, local_date: addDays(from, i) }));
    // Semana analisada (07–13/09): 7 de 7. Semana anterior (31/08–06/09): 3 de 7.
    supabase.state.db.seed('habit_checkins', [...days('2026-09-07', 7), ...days('2026-08-31', 3)]);
    renderApp('/analises/metas?periodo=custom&de=2026-09-07&ate=2026-09-13', { supabase });
    expect(await screen.findByText('+57 p.p. (antes: 43%)')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Consistência por hábito' });
    expect(
      within(table).getByRole('columnheader', { name: 'Período anterior' }),
    ).toBeInTheDocument();
    expect(within(table).getByText('43%')).toBeInTheDocument();
  });
});
