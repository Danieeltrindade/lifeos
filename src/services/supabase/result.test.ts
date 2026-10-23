import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/tests/fake-supabase';
import { fetchAll, insertOnce, PAGE_SIZE } from './result';

function seedTasks(n: number) {
  const supabase = createFakeSupabase();
  supabase.state.db.seed(
    'tasks',
    Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `Tarefa ${String(i)}`,
      // Muitos empates de data: só o desempate por id garante páginas sem repetição.
      created_at: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`,
    })),
  );
  return supabase;
}

describe('listas longas (max_rows = 1000 no servidor)', () => {
  it('um .limit() grande sozinho é cortado pelo servidor em 1000 linhas (o bug evitado)', async () => {
    const { client } = seedTasks(2345);
    const { data } = await client.from('tasks').select('*').limit(5000);
    expect(data).toHaveLength(PAGE_SIZE);
  });

  it('fetchAll traz todas as linhas, sem repetir nem pular, em ordem estável', async () => {
    const { client } = seedTasks(2345);
    const rows = await fetchAll((lo, hi) =>
      client
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(lo, hi),
    );
    expect(rows).toHaveLength(2345);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2345);
  });

  it('exatamente 1000 linhas: faz uma página extra vazia e para', async () => {
    const { client } = seedTasks(1000);
    const rows = await fetchAll((lo, hi) =>
      client.from('tasks').select('*').order('id', { ascending: true }).range(lo, hi),
    );
    expect(rows).toHaveLength(1000);
  });

  it('acima do teto, recusa com mensagem clara em vez de truncar em silêncio', async () => {
    const { client } = seedTasks(2345);
    await expect(
      fetchAll(
        (lo, hi) => client.from('tasks').select('*').order('id', { ascending: true }).range(lo, hi),
        2000,
      ),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ROWS' });
  });
});

describe('insertOnce (resposta perdida não duplica)', () => {
  const id = '00000000-0000-4000-8000-0000000000aa';
  const ok = <T>(data: T) => Promise.resolve({ data, error: null });
  const dup = () =>
    Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });

  it('primeira tentativa: devolve a linha criada', async () => {
    await expect(
      insertOnce(
        id,
        () => ok({ id }),
        () => ok(null),
      ),
    ).resolves.toEqual({ id });
  });

  it('nova tentativa após resposta perdida: a linha com o MESMO id já existe → sucesso', async () => {
    await expect(insertOnce(id, dup, () => ok({ id, title: 'já gravada' }))).resolves.toEqual({
      id,
      title: 'já gravada',
    });
  });

  it('conflito de verdade (nenhuma linha com este id) continua sendo erro', async () => {
    await expect(insertOnce(id, dup, () => ok(null))).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('sem id do cliente não há como saber: o conflito é erro', async () => {
    await expect(insertOnce(undefined, dup, () => ok({ id }))).rejects.toMatchObject({
      kind: 'conflict',
    });
  });

  it('outros erros não tentam recuperar', async () => {
    let read = false;
    await expect(
      insertOnce(
        id,
        () => Promise.resolve({ data: null, error: { code: '42501', message: 'rls' } }),
        () => {
          read = true;
          return ok({ id });
        },
      ),
    ).rejects.toMatchObject({ kind: 'permission' });
    expect(read).toBe(false);
  });
});
