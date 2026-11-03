/**
 * Integração contra um projeto Supabase REAL: Auth, PostgREST e RLS de verdade.
 *
 * Executar: npm run test:integration
 * Requer .env.local (URL + chave publishable) e .env.test.local com DUAS contas de teste
 * já confirmadas (ver docs/supabase-setup.md). Sem essas variáveis o arquivo é ignorado
 * com um aviso — nunca "passa" sem ter testado.
 *
 * Os registros criados são removidos no final; nenhum dado de conta pessoal é tocado.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/services/supabase/database.types';

type Client = SupabaseClient<Database>;
const env = import.meta.env as unknown as Record<string, string | undefined>;

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const accounts = {
  a: { email: env.LIFEOS_TEST_A_EMAIL, password: env.LIFEOS_TEST_A_PASSWORD },
  b: { email: env.LIFEOS_TEST_B_EMAIL, password: env.LIFEOS_TEST_B_PASSWORD },
};
const configured = Boolean(
  url && key && accounts.a.email && accounts.a.password && accounts.b.email && accounts.b.password,
);

if (!configured) {
  console.warn(
    '[test:integration] Variáveis ausentes (VITE_SUPABASE_*, LIFEOS_TEST_A_*, LIFEOS_TEST_B_*). Testes de integração NÃO executados.',
  );
}

function newClient(): Client {
  return createClient<Database>(url ?? '', key ?? '', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signedIn(account: { email?: string | undefined; password?: string | undefined }) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email ?? '',
    password: account.password ?? '',
  });
  if (error) throw new Error(`Login da conta de teste falhou: ${error.code ?? error.message}`);
  return { client, userId: data.user.id };
}

describe.runIf(configured)('Supabase real: autenticação, persistência e isolamento (RLS)', () => {
  let a: { client: Client; userId: string };
  let b: { client: Client; userId: string };
  const marker = `it-${Date.now().toString(36)}`;
  let projectId = '';
  let taskId = '';

  beforeAll(async () => {
    a = await signedIn(accounts.a);
    b = await signedIn(accounts.b);
  });

  afterAll(async () => {
    // Limpeza: o próprio dono remove o que criou (e as tarefas caem por SET NULL/cascata).
    if (taskId) await a.client.from('tasks').delete().eq('id', taskId);
    if (projectId) await a.client.from('projects').delete().eq('id', projectId);
    await a.client.auth.signOut();
    await b.client.auth.signOut();
  });

  it('as contas de teste são diferentes e têm perfil criado no cadastro', async () => {
    expect(a.userId).not.toBe(b.userId);
    const { data, error } = await a.client.from('profiles').select('id, timezone').single();
    expect(error).toBeNull();
    expect(data?.id).toBe(a.userId);
  });

  it('A grava e lê de volta (persistência autenticada)', async () => {
    const project = await a.client
      .from('projects')
      .insert({ name: `Projeto ${marker}` })
      .select('id, user_id')
      .single();
    expect(project.error).toBeNull();
    projectId = project.data?.id ?? '';
    expect(project.data?.user_id).toBe(a.userId);

    const task = await a.client
      .from('tasks')
      .insert({ title: `Tarefa ${marker}`, project_id: projectId, priority: 'high' })
      .select('id')
      .single();
    expect(task.error).toBeNull();
    taskId = task.data?.id ?? '';

    const readBack = await newClientAs(a).then((c) =>
      c.from('tasks').select('title').eq('id', taskId).single(),
    );
    expect(readBack.data?.title).toBe(`Tarefa ${marker}`);
  });

  it('B não lê, não altera e não exclui os dados de A', async () => {
    const read = await b.client.from('tasks').select('id').eq('id', taskId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const update = await b.client
      .from('tasks')
      .update({ title: 'invadido' })
      .eq('id', taskId)
      .select('id');
    expect(update.data ?? []).toEqual([]);

    const del = await b.client.from('tasks').delete().eq('id', taskId).select('id');
    expect(del.data ?? []).toEqual([]);

    const stillThere = await a.client.from('tasks').select('title').eq('id', taskId).single();
    expect(stillThere.data?.title).toBe(`Tarefa ${marker}`);
  });

  it('B não cria registro em nome de A nem ligado a um registro de A', async () => {
    const impersonate = await b.client.from('projects').insert({ name: 'x', user_id: a.userId });
    expect(impersonate.error?.code).toBe('42501');

    const crossLink = await b.client.from('tasks').insert({ title: 'x', project_id: projectId });
    expect(crossLink.error?.code).toBe('23503');
  });

  it('funções não vazam dados de outra conta', async () => {
    const summary = await b.client.rpc('dashboard_summary');
    expect(summary.error).toBeNull();
    expect(JSON.stringify(summary.data)).not.toContain(marker);

    const exported = await b.client.rpc('export_my_data');
    expect(exported.error).toBeNull();
    expect(JSON.stringify(exported.data)).not.toContain(marker);
  });

  it('sem login (chave pública apenas) nada é acessível', async () => {
    const anon = newClient();
    const tasks = await anon.from('tasks').select('id').limit(1);
    expect(tasks.error?.code).toBe('42501');
    const rpc = await anon.rpc('dashboard_summary');
    expect(rpc.error).not.toBeNull();
  });

  it('A atualiza o próprio perfil', async () => {
    const { data: before } = await a.client.from('profiles').select('week_starts_on').single();
    const next = before?.week_starts_on === 1 ? 0 : 1;
    const updated = await a.client
      .from('profiles')
      .update({ week_starts_on: next })
      .eq('id', a.userId)
      .select('week_starts_on')
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data?.week_starts_on).toBe(next);
    await a.client
      .from('profiles')
      .update({ week_starts_on: before?.week_starts_on ?? 1 })
      .eq('id', a.userId);
  });

  it('paleta de cores: cada conta tem a sua e B não altera a de A', async () => {
    const { data: original } = await a.client.from('profiles').select('theme_color').single();
    const { data: originalB } = await b.client.from('profiles').select('theme_color').single();
    const saved = await a.client
      .from('profiles')
      .update({ theme_color: 'nebula' })
      .eq('id', a.userId)
      .select('theme_color')
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data?.theme_color).toBe('nebula');

    // Valor fora da lista é recusado pelo banco (CHECK).
    const invalid = await a.client
      .from('profiles')
      .update({ theme_color: 'neon' })
      .eq('id', a.userId);
    expect(invalid.error?.code).toBe('23514');

    // B tenta gravar na linha de A: o RLS filtra (nenhuma linha afetada).
    const attack = await b.client
      .from('profiles')
      .update({ theme_color: 'gold' })
      .eq('id', a.userId)
      .select('id');
    expect(attack.data ?? []).toHaveLength(0);

    // Nova sessão de A (recarregar / entrar de novo) lê a paleta salva; B segue com a dele.
    const again = await newClientAs(a);
    const { data: reread } = await again.from('profiles').select('theme_color').single();
    expect(reread?.theme_color).toBe('nebula');
    const { data: bNow } = await b.client.from('profiles').select('theme_color').single();
    expect(bNow?.theme_color).toBe(originalB?.theme_color);

    await a.client
      .from('profiles')
      .update({ theme_color: original?.theme_color ?? 'ocean' })
      .eq('id', a.userId);
  });
});

/** Um segundo cliente com a mesma sessão de A (simula outra aba/recarga). */
async function newClientAs(session: { client: Client }): Promise<Client> {
  const { data } = await session.client.auth.getSession();
  const client = newClient();
  if (data.session) {
    await client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }
  return client;
}
