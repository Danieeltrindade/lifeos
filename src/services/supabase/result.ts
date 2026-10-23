import { AppError, toAppError } from './errors';

/**
 * Desembrulha a resposta { data, error } do supabase-js: devolve os dados ou lança um
 * AppError (mensagem segura). `null` em `data` sem erro vira lista vazia/valor nulo
 * conforme o chamador.
 */
export async function must<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) throw toAppError(error);
  if (data === null || data === undefined)
    throw toAppError({ code: 'PGRST116', message: 'no rows' });
  return data;
}

/** Igual a `must`, para escritas sem retorno. */
export async function mustSucceed(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query;
  if (error) throw toAppError(error);
}

/** Leituras de lista: `null` sem erro vira []. */
export async function mustList<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data ?? [];
}

/**
 * Tamanho da página = `max_rows` padrão do PostgREST no Supabase (1000). O servidor NUNCA
 * devolve mais que isso por requisição, mesmo com `.limit(5000)` — por isso listas usam
 * `fetchAll` em vez de um `.limit()` grande (que truncaria em silêncio).
 * Requisito documentado em docs/supabase-setup.md: não reduzir `max_rows` abaixo de 1000.
 */
export const PAGE_SIZE = 1000;

/** Teto de segurança: acima disso a tela recusa carregar tudo em vez de travar o navegador. */
export const FETCH_ALL_LIMIT = 50_000;

/**
 * Lê TODAS as linhas de uma consulta, página por página (`range`). A consulta precisa ter
 * ordenação total (terminar em `.order('id')`) para que páginas não repitam nem pulem linhas.
 * Nunca trunca em silêncio: se passar do teto, lança erro explicando o motivo.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  limit = FETCH_ALL_LIMIT,
): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const rows = await mustList(page(out.length, out.length + PAGE_SIZE - 1));
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
    if (out.length >= limit) {
      throw new AppError(
        'unknown',
        `Há mais de ${limit.toLocaleString('pt-BR')} registros para esta tela. Escolha um período menor.`,
        'TOO_MANY_ROWS',
      );
    }
  }
}

/**
 * Criação idempotente. O formulário gera o `id` UMA vez (useDraftId) e o reenvia em cada nova
 * tentativa. Se a resposta da primeira se perdeu na rede depois de o servidor gravar, a nova
 * tentativa esbarra numa restrição de unicidade (23505); então lemos a linha com ESSE id — se ela
 * existe, a criação já tinha dado certo e devolvemos o que foi gravado, sem duplicar. Uma linha com
 * outro id (ex.: um nome repetido de verdade) continua sendo erro.
 */
export async function insertOnce<T>(
  id: string | null | undefined,
  insert: () => PromiseLike<{ data: T | null; error: unknown }>,
  readBack: () => PromiseLike<{ data: T | null; error: unknown }>,
): Promise<NonNullable<T>> {
  const { data, error } = await insert();
  if (!error) {
    if (data === null || data === undefined) {
      throw toAppError({ code: 'PGRST116', message: 'no rows' });
    }
    return data;
  }
  if (id && isUniqueViolation(error)) {
    const prior = await readBack();
    if (!prior.error && prior.data !== null && prior.data !== undefined) return prior.data;
  }
  throw toAppError(error);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
