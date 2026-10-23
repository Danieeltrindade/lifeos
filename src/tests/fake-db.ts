/**
 * "PostgREST" em memória para testes de fluxo (CRUD) dos módulos.
 *
 * Implementa o subconjunto do query builder do supabase-js usado pelos repositórios:
 * select · insert · update · upsert · delete, filtros eq/neq/in/is/gt/gte/lt/lte/ilike/not,
 * order · limit · single · maybeSingle · abortSignal, com respostas { data, error }.
 *
 * NÃO reproduz o banco: gatilhos, RLS e regras de negócio do servidor são testados com
 * pgTAP (supabase/tests). Aqui o objetivo é exercitar a interface: o que é enviado, como a
 * tela reage a sucesso, erro de rede, erro de validação e dados vazios.
 */
import { TABLE_DEFAULTS } from './table-defaults';
import { TEST_USER_ID } from './test-ids';

/** `max_rows` padrão do PostgREST no Supabase. */
export const MAX_ROWS = 1000;

export type Row = Record<string, unknown>;
export interface FakeError {
  code?: string;
  message: string;
  status?: number;
  name?: string;
}
export interface Result<T> {
  data: T | null;
  error: FakeError | null;
  count?: number | null;
}

type Filter = (row: Row) => boolean;

let counter = 0;
export function fakeUuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

export const NETWORK_ERROR: FakeError = { message: 'Failed to fetch', name: 'TypeError' };

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return text(a) < text(b) ? -1 : 1;
}

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return v === undefined ? '' : JSON.stringify(v);
}

export function createFakeDb() {
  const tables = new Map<string, Row[]>();
  /** Próximo erro por tabela ou rpc (consumido na próxima chamada). */
  const failures = new Map<string, FakeError[]>();
  const rpcHandlers = new Map<string, (args: Row) => unknown>();
  const log: { table: string; op: string; payload?: unknown }[] = [];

  const rowsOf = (table: string) => {
    let rows = tables.get(table);
    if (!rows) {
      rows = [];
      tables.set(table, rows);
    }
    return rows;
  };

  function withDefaults(row: Row, table: string): Row {
    const now = new Date().toISOString();
    return {
      ...TABLE_DEFAULTS[table],
      id: fakeUuid(),
      user_id: TEST_USER_ID,
      created_at: now,
      updated_at: now,
      ...row,
    };
  }

  function takeFailure(key: string): FakeError | null {
    const queue = failures.get(key);
    const f = queue?.shift();
    return f ?? null;
  }

  function from(table: string) {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: Row | Row[] | null = null;
    let orders: { column: string; ascending: boolean }[] = [];
    let limit: number | null = null;
    let offset = 0;
    let mode: 'many' | 'single' | 'maybe' = 'many';
    let wantCount = false;
    let returning = false;
    let conflictKeys: string[] = ['id'];

    const run = (): Promise<Result<unknown>> => {
      const failure = takeFailure(table);
      if (failure) return Promise.resolve({ data: null, error: failure });
      const rows = rowsOf(table);
      const match = (r: Row) => filters.every((f) => f(r));
      let out: Row[] = [];
      if (op === 'select') {
        out = rows.filter(match);
      } else if (op === 'insert' || op === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload ?? {}]).map((r) =>
          withDefaults(r, table),
        );
        for (const row of list) {
          const existing =
            op === 'upsert'
              ? rows.findIndex((r) =>
                  conflictKeys.every((k) => r[k] === row[k] && r[k] !== undefined),
                )
              : -1;
          const target = existing >= 0 ? rows[existing] : undefined;
          if (target) {
            // Como no Postgres: a linha existente mantém o id; só as colunas enviadas mudam.
            const sent = Array.isArray(payload) ? payload[list.indexOf(row)] : payload;
            Object.assign(target, sent ?? {}, { updated_at: new Date().toISOString() });
            out.push(target);
          } else {
            rows.push(row);
            out.push(row);
          }
        }
      } else if (op === 'update') {
        out = rows.filter(match);
        for (const r of out) Object.assign(r, payload, { updated_at: new Date().toISOString() });
      } else {
        out = rows.filter(match);
        tables.set(
          table,
          rows.filter((r) => !out.includes(r)),
        );
      }
      log.push({ table, op, payload });
      for (const o of [...orders].reverse()) {
        out = [...out].sort((a, b) => {
          const c = compare(a[o.column], b[o.column]);
          return o.ascending ? c : -c;
        });
      }
      if (op === 'select') {
        // Como o PostgREST do Supabase: no máximo MAX_ROWS linhas por requisição, mesmo que o
        // cliente peça mais (.limit/.range maiores). Listas precisam paginar (fetchAll).
        const take = Math.min(limit ?? MAX_ROWS, MAX_ROWS);
        out = out.slice(offset, offset + take);
      } else if (limit !== null) {
        out = out.slice(0, limit);
      }
      const copy = out.map((r) => ({ ...r }));
      if (op !== 'select' && !returning) {
        return Promise.resolve({ data: null, error: null, count: wantCount ? copy.length : null });
      }
      if (mode === 'single') {
        if (copy.length !== 1) {
          return Promise.resolve({
            data: null,
            error: {
              code: 'PGRST116',
              message: 'JSON object requested, multiple (or no) rows returned',
            },
          });
        }
        return Promise.resolve({ data: copy[0], error: null });
      }
      if (mode === 'maybe') return Promise.resolve({ data: copy[0] ?? null, error: null });
      return Promise.resolve({ data: copy, error: null, count: wantCount ? copy.length : null });
    };

    const builder = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        if (op !== 'select') returning = true;
        if (options?.count) wantCount = true;
        return builder;
      },
      insert(rows: Row | Row[]) {
        op = 'insert';
        payload = rows;
        return builder;
      },
      upsert(rows: Row | Row[], options?: { onConflict?: string }) {
        op = 'upsert';
        payload = rows;
        if (options?.onConflict) conflictKeys = options.onConflict.split(',').map((k) => k.trim());
        return builder;
      },
      update(patch: Row) {
        op = 'update';
        payload = patch;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((r) => r[column] === value);
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push((r) => r[column] !== value);
        return builder;
      },
      in(column: string, values: readonly unknown[]) {
        filters.push((r) => values.includes(r[column]));
        return builder;
      },
      is(column: string, value: null | boolean) {
        filters.push((r) => (r[column] ?? null) === value);
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        if (operator === 'is') filters.push((r) => (r[column] ?? null) !== value);
        else if (operator === 'in') {
          const list = String(value).replace(/[()]/g, '').split(',');
          filters.push((r) => !list.includes(text(r[column])));
        } else filters.push((r) => r[column] !== value);
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push((r) => r[column] !== null && compare(r[column], value) > 0);
        return builder;
      },
      gte(column: string, value: unknown) {
        filters.push((r) => r[column] !== null && compare(r[column], value) >= 0);
        return builder;
      },
      lt(column: string, value: unknown) {
        filters.push((r) => r[column] !== null && compare(r[column], value) < 0);
        return builder;
      },
      lte(column: string, value: unknown) {
        filters.push((r) => r[column] !== null && compare(r[column], value) <= 0);
        return builder;
      },
      ilike(column: string, pattern: string) {
        const needle = pattern.replace(/%/g, '').toLowerCase();
        filters.push((r) =>
          text(r[column] ?? '')
            .toLowerCase()
            .includes(needle),
        );
        return builder;
      },
      order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
        orders = [...orders, { column, ascending: options?.ascending ?? true }];
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      range(fromIndex: number, toIndex: number) {
        offset = fromIndex;
        limit = toIndex - fromIndex + 1;
        return builder;
      },
      single() {
        mode = 'single';
        return builder;
      },
      maybeSingle() {
        mode = 'maybe';
        return builder;
      },
      abortSignal() {
        return builder;
      },
      then<A, B>(
        onFulfilled?: (v: Result<unknown>) => A | PromiseLike<A>,
        onRejected?: (e: unknown) => B | PromiseLike<B>,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  function rpc(name: string, args: Row = {}) {
    const run = async (): Promise<Result<unknown>> => {
      const failure = takeFailure(`rpc:${name}`);
      if (failure) return { data: null, error: failure };
      const handler = rpcHandlers.get(name);
      if (!handler) return { data: null, error: { code: 'PGRST202', message: `rpc ${name}` } };
      log.push({ table: `rpc:${name}`, op: 'rpc', payload: args });
      try {
        return { data: await handler(args), error: null };
      } catch (error) {
        const e = error as Partial<FakeError>;
        return { data: null, error: { code: e.code ?? 'P0001', message: e.message ?? 'erro' } };
      }
    };
    let single = false;
    const builder = {
      abortSignal: () => builder,
      single: () => {
        single = true;
        return builder;
      },
      then<A, B>(
        onFulfilled?: (v: Result<unknown>) => A | PromiseLike<A>,
        onRejected?: (e: unknown) => B | PromiseLike<B>,
      ) {
        return run()
          .then((r): Result<unknown> => {
            if (!single || !Array.isArray(r.data)) return r;
            const list: unknown[] = r.data;
            return { ...r, data: list[0] ?? null };
          })
          .then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from,
    rpc,
    log,
    /** Insere linhas diretamente (com id/user_id/datas padrão). */
    seed(table: string, rows: Row[]): Row[] {
      const list = rows.map((r) => withDefaults(r, table));
      rowsOf(table).push(...list);
      return list;
    },
    rows(table: string): Row[] {
      return rowsOf(table);
    },
    /** Faz a próxima chamada a `key` (tabela ou "rpc:nome") falhar; chamadas acumulam. */
    failNext(key: string, error: FakeError = NETWORK_ERROR) {
      failures.set(key, [...(failures.get(key) ?? []), error]);
    },
    onRpc(name: string, handler: (args: Row) => unknown) {
      rpcHandlers.set(name, handler);
    },
  };
}

export type FakeDb = ReturnType<typeof createFakeDb>;
