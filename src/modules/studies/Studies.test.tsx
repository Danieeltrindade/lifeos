import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { installStudyRpcs } from '@/tests/domain-rpcs';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

function setup() {
  const supabase = createFakeSupabase();
  installStudyRpcs(supabase.state.db);
  return supabase;
}

describe('Estudos — matérias e tópicos', () => {
  it('cria matéria, tópico e registra um ajuste MANUAL de domínio', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    renderApp('/estudos', { supabase });
    expect(await screen.findByText('Nenhuma matéria ainda')).toBeInTheDocument();
    const [button] = screen.getAllByRole('button', { name: 'Nova matéria' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Nova matéria' });
    await user.type(within(dialog).getByLabelText('Nome'), 'Cálculo II');
    await user.type(within(dialog).getByLabelText('Carga pretendida (h/semana)'), '6');
    await user.click(within(dialog).getByRole('button', { name: 'Criar matéria' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Cálculo II' }),
    ).toBeInTheDocument();
    expect(supabase.state.db.rows('subjects')[0]).toMatchObject({
      name: 'Cálculo II',
      target_minutes_per_week: 360,
    });

    await user.click(await screen.findByRole('button', { name: 'Novo tópico' }));
    const topicDialog = await screen.findByRole('dialog', { name: 'Novo tópico' });
    await user.type(within(topicDialog).getByLabelText('Nome'), 'Integrais');
    await user.click(within(topicDialog).getByRole('button', { name: 'Criar tópico' }));
    const detail = await screen.findByRole('dialog', { name: 'Integrais' });
    expect(within(detail).getByText('Domínio: Sem registro')).toBeInTheDocument();

    await user.selectOptions(within(detail).getByLabelText('Ajuste manual'), '2');
    await user.type(within(detail).getByLabelText('Motivo (opcional)'), 'Fiz a lista 1');
    await user.click(within(detail).getByRole('button', { name: 'Registrar' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('topic_mastery_events')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('topic_mastery_events')[0]).toMatchObject({
      level: 2,
      source: 'manual',
      note: 'Fiz a lista 1',
    });
  });
});

describe('Estudos — cronômetro', () => {
  it('inicia uma sessão pelo servidor e impede outra simultânea', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    renderApp('/estudos/cronometro', { supabase });
    await user.selectOptions(await screen.findByLabelText('Duração'), 'pomodoro');
    await user.click(screen.getByRole('button', { name: 'Iniciar sessão' }));
    expect(await screen.findByRole('heading', { name: 'Sessão em andamento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar sessão' })).not.toBeInTheDocument();
    expect(supabase.state.db.rows('focus_sessions')[0]).toMatchObject({
      status: 'active',
      planned_seconds: 1500,
      technique: 'pomodoro',
    });
  });

  it('recupera a sessão depois de recarregar: o tempo vem do início gravado', async () => {
    const supabase = setup();
    const started = new Date(Date.now() - (10 * 60 + 5) * 1000).toISOString();
    const [session] = supabase.state.db.seed('focus_sessions', [
      {
        status: 'active',
        started_at: started,
        ended_at: null,
        technique: 'free',
        planned_seconds: null,
        subject_id: null,
        topic_id: null,
        task_id: null,
        note: '',
      },
    ]);
    // Pausa de 2 minutos já encerrada: o tempo líquido é ~8 min.
    supabase.state.db.seed('session_pauses', [
      {
        session_id: session?.id,
        started_at: new Date(Date.now() - 6 * 60_000).toISOString(),
        ended_at: new Date(Date.now() - 4 * 60_000).toISOString(),
      },
    ]);
    renderApp('/estudos/cronometro', { supabase });
    const timer = await screen.findByRole('timer');
    expect(timer.textContent).toMatch(/^08:0\d$/);
  });

  it('encerrar registra a sessão e abre a reflexão', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    supabase.state.db.seed('focus_sessions', [
      {
        status: 'active',
        started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        ended_at: null,
        technique: 'free',
        planned_seconds: null,
        subject_id: null,
        topic_id: null,
        task_id: null,
        note: '',
      },
    ]);
    renderApp('/estudos/cronometro', { supabase });
    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reflexão da sessão' });
    await user.type(within(dialog).getByLabelText('Questões feitas'), '10');
    await user.type(within(dialog).getByLabelText('Questões certas'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar reflexão' }));
    expect(
      await within(dialog).findByText('Os acertos não podem passar do número de questões.'),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Questões certas'));
    await user.type(within(dialog).getByLabelText('Questões certas'), '7');
    await user.type(
      within(dialog).getByLabelText('O que ainda está confuso'),
      'Substituição trigonométrica',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Salvar reflexão' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('session_reflections')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('session_reflections')[0]).toMatchObject({
      questions_count: 10,
      correct_count: 7,
      confusing: 'Substituição trigonométrica',
    });
    expect(supabase.state.db.rows('activities')).toHaveLength(1);
  });
});

describe('Estudos — revisões', () => {
  it('mostra a próxima data de cada nota e registra a tentativa', async () => {
    const user = userEvent.setup();
    const supabase = setup();
    const [subject] = supabase.state.db.seed('subjects', [{ name: 'Física' }]);
    const [topic] = supabase.state.db.seed('topics', [
      { name: 'Cinemática', subject_id: subject?.id },
    ]);
    supabase.state.db.seed('review_cards', [{ topic_id: topic?.id, due_on: '2020-01-01' }]);
    renderApp('/estudos/revisoes', { supabase });
    expect(await screen.findByRole('heading', { name: /Atrasadas/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revisar Cinemática' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revisão: Cinemática' });
    expect(
      within(dialog).getByRole('button', { name: /Errei\s*próxima em 1 dia/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /Bom\s*próxima em 3 dias/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /Fácil\s*próxima em 7 dias/ }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Bom/ }));
    await waitFor(() => {
      expect(supabase.state.db.rows('review_attempts')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('review_attempts')[0]).toMatchObject({ grade: 3 });
  });
});
