import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { addDays, localDateIn } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { renderApp } from '@/tests/render-app';

// Horários HOJE (fuso do perfil de teste), sempre dentro da semana visível.
const today = localDateIn(new Date(), 'America/Sao_Paulo');
function inOneHour(hours: number) {
  return zonedToUtc(
    today,
    `${String(9 + hours).padStart(2, '0')}:00`,
    'America/Sao_Paulo',
  ).toISOString();
}

describe('Calendário', () => {
  it('mostra eventos, prazos e permite criar evento recorrente sem copiar ocorrências', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    supabase.state.db.seed('calendar_events', [
      { title: 'Reunião de orientação', starts_at: inOneHour(1), ends_at: inOneHour(2) },
    ]);
    renderApp('/calendario', { supabase });
    expect(await screen.findByText('Reunião de orientação')).toBeInTheDocument();

    const [button] = screen.getAllByRole('button', { name: 'Novo evento' });
    if (!button) throw new Error('sem botão');
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Novo evento' });
    await user.type(within(dialog).getByLabelText('Título'), 'Academia');
    await user.selectOptions(within(dialog).getByLabelText('Repetir'), 'WEEKLY');
    await user.selectOptions(within(dialog).getByLabelText('Termina'), 'count');
    const count = within(dialog).getByLabelText('Vezes');
    await user.clear(count);
    await user.type(count, '8');
    await user.click(within(dialog).getByRole('button', { name: 'Criar evento' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('calendar_events')).toHaveLength(2);
    });
    const created = supabase.state.db.rows('calendar_events')[1];
    expect(created?.recurrence_rule).toMatch(/^FREQ=WEEKLY;BYDAY=[A-Z]{2};COUNT=8$/);
    expect(created?.timezone).toBe('America/Sao_Paulo');
  });

  it('bloco de tarefa não conclui a tarefa e explica isso', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const [task] = supabase.state.db.seed('tasks', [{ title: 'Escrever capítulo' }]);
    supabase.state.db.seed('calendar_events', [
      {
        title: 'Foco no capítulo',
        kind: 'task',
        task_id: task?.id,
        starts_at: inOneHour(1),
        ends_at: inOneHour(3),
      },
    ]);
    renderApp('/calendario', { supabase });
    await user.click(await screen.findByText('Foco no capítulo'));
    const dialog = await screen.findByRole('dialog', { name: 'Foco no capítulo' });
    expect(within(dialog).getByText(/não conclui a tarefa/)).toBeInTheDocument();
    expect(within(dialog).getByText('Planejado')).toBeInTheDocument();
    expect(supabase.state.db.rows('tasks')[0]?.status).toBe('todo');
  });

  it('aponta conflitos entre compromisso e bloco sem mover nada', async () => {
    const supabase = createFakeSupabase();
    supabase.state.db.seed('calendar_events', [
      { title: 'Aula de cálculo', starts_at: inOneHour(1), ends_at: inOneHour(3) },
      { title: 'Estudar física', kind: 'study', starts_at: inOneHour(2), ends_at: inOneHour(4) },
    ]);
    renderApp('/calendario', { supabase });
    expect(await screen.findByText(/1 conflito\(s\) de horário/)).toBeInTheDocument();
    expect(screen.getByText(/se sobrepõem por 60 min/)).toBeInTheDocument();
    expect(screen.getByText('⚠ Aula de cálculo')).toBeInTheDocument();
    expect(supabase.state.db.rows('calendar_events').map((e) => e.starts_at)).toEqual([
      inOneHour(1),
      inOneHour(2),
    ]);
  });

  it('edita só uma ocorrência (exceção) e "esta e as seguintes" (divide a série)', async () => {
    const user = userEvent.setup();
    const supabase = createFakeSupabase();
    const start = zonedToUtc(addDays(today, -7), '07:00', 'America/Sao_Paulo').toISOString();
    const end = zonedToUtc(addDays(today, -7), '08:00', 'America/Sao_Paulo').toISOString();
    const [series] = supabase.state.db.seed('calendar_events', [
      { title: 'Plantão', starts_at: start, ends_at: end, recurrence_rule: 'FREQ=DAILY;COUNT=20' },
    ]);
    renderApp('/calendario', { supabase });

    // 1) Só esta ocorrência.
    const [first] = await screen.findAllByText('Plantão');
    if (!first) throw new Error('sem ocorrência');
    await user.click(first);
    let dialog = await screen.findByRole('dialog', { name: 'Plantão' });
    await user.click(within(dialog).getByRole('button', { name: 'Editar só esta' }));
    dialog = await screen.findByRole('dialog', { name: 'Editar só esta ocorrência' });
    const title = within(dialog).getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Plantão extra');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar só esta ocorrência' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('calendar_event_exceptions')).toHaveLength(1);
    });
    expect(supabase.state.db.rows('calendar_event_exceptions')[0]).toMatchObject({
      event_id: series?.id,
      kind: 'modified',
      new_title: 'Plantão extra',
    });
    expect(supabase.state.db.rows('calendar_events')[0]?.recurrence_rule).toBe(
      'FREQ=DAILY;COUNT=20',
    );

    // 2) Esta e as seguintes: a série original termina antes; uma nova começa aqui.
    const [occurrence] = await screen.findAllByText('Plantão');
    if (!occurrence) throw new Error('sem ocorrência');
    await user.click(occurrence);
    dialog = await screen.findByRole('dialog', { name: 'Plantão' });
    await user.click(within(dialog).getByRole('button', { name: 'Editar esta e as seguintes' }));
    dialog = await screen.findByRole('dialog', { name: 'Editar esta e as próximas ocorrências' });
    const t2 = within(dialog).getByLabelText('Título');
    await user.clear(t2);
    await user.type(t2, 'Plantão novo');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar esta e as próximas' }));
    await waitFor(() => {
      expect(supabase.state.db.rows('calendar_events')).toHaveLength(2);
    });
    const [old, created] = supabase.state.db.rows('calendar_events');
    const kept = Number(/COUNT=(\d+)/.exec(String(old?.recurrence_rule))?.[1]);
    const rest = Number(/COUNT=(\d+)/.exec(String(created?.recurrence_rule))?.[1]);
    expect(kept).toBeGreaterThan(0);
    expect(kept + rest).toBe(20);
    expect(created).toMatchObject({ title: 'Plantão novo', timezone: 'America/Sao_Paulo' });
  });
});
