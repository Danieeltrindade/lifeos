/**
 * Consistência (Fase 5, §6) contra Auth + PostgREST + PostgreSQL reais: o banco é a fonte de
 * verdade e cada alteração aparece nos indicadores que dependem dela — pelos MESMOS cálculos
 * que as telas usam (public.stats_*, public.goal_progress).
 *
 * Usa um intervalo em 2021 que nenhum outro teste toca, para medir sem interferência dos
 * demais registros da conta de teste. Tudo o que é criado aqui é removido no final.
 *
 * Executar: npm run test:integration (ver docs/testing.md).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/services/supabase/database.types';

type Client = SupabaseClient<Database>;
const env = import.meta.env as unknown as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(url && key && env.LIFEOS_TEST_A_EMAIL && env.LIFEOS_TEST_A_PASSWORD);

const FROM = '2021-03-01';
const TO = '2021-03-08'; // [from, to)

interface StudyStats {
  totals: { seconds: number };
  sessions: { count: number };
}
interface TaskStats {
  created: number;
  due: { total: number; doneOnTime: number; doneLate: number; open: number };
}

describe.runIf(configured)('consistência: alterações refletem nos indicadores', () => {
  let client: Client;
  const created: { table: 'focus_sessions' | 'tasks' | 'goals' | 'subjects'; id: string }[] = [];

  const study = async () => {
    const { data, error } = await client.rpc('stats_study', { p_from: FROM, p_to: TO });
    if (error) throw error;
    return data as unknown as StudyStats;
  };
  const tasks = async () => {
    const { data, error } = await client.rpc('stats_tasks', { p_from: FROM, p_to: TO });
    if (error) throw error;
    return data as unknown as TaskStats;
  };

  beforeAll(async () => {
    client = createClient<Database>(url ?? '', key ?? '', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email: env.LIFEOS_TEST_A_EMAIL ?? '',
      password: env.LIFEOS_TEST_A_PASSWORD ?? '',
    });
    if (error) throw new Error(`Login da conta de teste falhou: ${error.message}`);
    // O perfil de teste usa o fuso padrão; o intervalo de 2021 independe da data de hoje.
  });

  afterAll(async () => {
    for (const { table, id } of created.reverse()) await client.from(table).delete().eq('id', id);
    await client.auth.signOut();
  });

  it('editar e excluir uma sessão atualiza o tempo de estudo', async () => {
    const before = await study();
    const { data: subject } = await client
      .from('subjects')
      .insert({ name: `Consistência ${Date.now().toString(36)}` })
      .select('id')
      .single();
    if (!subject) throw new Error('matéria não criada');
    created.push({ table: 'subjects', id: subject.id });
    const { data: session, error } = await client
      .from('focus_sessions')
      .insert({
        subject_id: subject.id,
        status: 'completed',
        started_at: '2021-03-02T13:00:00Z',
        ended_at: '2021-03-02T14:00:00Z',
      })
      .select('id')
      .single();
    if (error) throw error;
    created.push({ table: 'focus_sessions', id: session.id });
    expect((await study()).totals.seconds - before.totals.seconds).toBe(3600);

    // Correção da duração: 1 h → 30 min.
    await client
      .from('focus_sessions')
      .update({ ended_at: '2021-03-02T13:30:00Z' })
      .eq('id', session.id)
      .throwOnError();
    expect((await study()).totals.seconds - before.totals.seconds).toBe(1800);

    await client.from('focus_sessions').delete().eq('id', session.id).throwOnError();
    const after = await study();
    expect(after.totals.seconds).toBe(before.totals.seconds);
    expect(after.sessions.count).toBe(before.sessions.count);
  });

  it('alterar o prazo e excluir a tarefa atualizam os indicadores de prazo', async () => {
    const before = await tasks();
    const { data: task, error } = await client
      .from('tasks')
      .insert({ title: 'Tarefa de consistência', due_on: '2021-03-03' })
      .select('id')
      .single();
    if (error) throw error;
    created.push({ table: 'tasks', id: task.id });
    expect((await tasks()).due.total - before.due.total).toBe(1);

    // Prazo movido para fora do período: deixa de contar nele.
    await client.from('tasks').update({ due_on: '2021-04-10' }).eq('id', task.id).throwOnError();
    expect((await tasks()).due.total).toBe(before.due.total);

    await client.from('tasks').update({ due_on: '2021-03-04' }).eq('id', task.id).throwOnError();
    expect((await tasks()).due.total - before.due.total).toBe(1);

    await client.from('tasks').delete().eq('id', task.id).throwOnError();
    expect((await tasks()).due.total).toBe(before.due.total);
  });

  it('editar a meta muda o alvo, não os registros que formam o progresso', async () => {
    const { data: goal, error } = await client
      .from('goals')
      .insert({
        title: 'Meta de consistência',
        progress_mode: 'manual',
        target_value: 10,
        unit: 'páginas',
        start_on: '2021-03-01',
      })
      .select('id')
      .single();
    if (error) throw error;
    created.push({ table: 'goals', id: goal.id });
    await client
      .from('goal_progress_entries')
      .insert([
        { goal_id: goal.id, amount: 3, recorded_on: '2021-03-02' },
        { goal_id: goal.id, amount: 4, recorded_on: '2021-03-03' },
      ])
      .throwOnError();
    const progress = async () => {
      const { data } = await client.rpc('goal_progress').throwOnError();
      return data.find((r) => r.goal_id === goal.id);
    };
    expect(await progress()).toMatchObject({ current_value: 7, target_value: 10 });

    await client
      .from('goals')
      .update({ target_value: 20, title: 'Meta de consistência (editada)' })
      .eq('id', goal.id)
      .throwOnError();
    expect(await progress()).toMatchObject({ current_value: 7, target_value: 20 });
    const { data: entries } = await client
      .from('goal_progress_entries')
      .select('amount')
      .eq('goal_id', goal.id)
      .throwOnError();
    expect(entries.map((e) => e.amount).sort()).toEqual([3, 4]);
  });
});
