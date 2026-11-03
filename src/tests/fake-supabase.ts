import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { vi } from 'vitest';
import type { LifeosClient } from '@/services/supabase/client';
import type { Tables } from '@/services/supabase/database.types';
import { createFakeDb } from './fake-db';
import { TEST_USER_ID } from './test-ids';

export { TEST_USER_ID };

/**
 * Cliente Supabase FALSO para testes de componentes: substitui apenas a rede.
 * Implementa o subconjunto da API usado pelo app (auth, from, rpc) com o mesmo formato de
 * resposta { data, error }. "profiles" tem tratamento próprio; as demais tabelas e RPCs vão
 * para um banco em memória (fake-db.ts). Testes de segurança de verdade estão em
 * supabase/tests (pgTAP) e em src/tests/integration (projeto real).
 */
type Result<T> = {
  data: T | null;
  error: { code?: string; message: string; status?: number; name?: string } | null;
};

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: TEST_USER_ID,
    email: 'ana@example.test',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

export function makeSession(user: User = makeUser()): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

export function makeProfileRow(overrides: Partial<Tables<'profiles'>> = {}): Tables<'profiles'> {
  return {
    id: TEST_USER_ID,
    display_name: 'Ana',
    timezone: 'America/Sao_Paulo',
    week_starts_on: 1,
    theme_preference: 'system',
    theme_color: 'ocean',
    email_notifications: false,
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

/** Resumo vazio VÁLIDO (passa no schema Zod), como o banco devolve para uma conta nova. */
export function emptySummaryJson(timezone = 'America/Sao_Paulo', localDate = '2026-10-20') {
  return {
    origin: 'user',
    timezone,
    localDate,
    priorityTasks: [],
    goals: [],
    studies: {
      actualMinutesToday: 0,
      actualMinutesLast7Days: 0,
      sessionsToday: 0,
      topSubjectsLast7Days: [],
    },
    reviews: [],
    reviewCounts: { overdue: 0, dueToday: 0 },
    recentActivities: [],
    activeProjects: [],
    recommendations: [],
    setup: { subjects: 0, tasks: 0, habits: 0, goals: 0, activities: 0, events: 0 },
  };
}

type Listener = (event: AuthChangeEvent, session: Session | null) => void;
type RpcHandler = (args: unknown) => Promise<Result<unknown>>;

/** Thenable encadeável que imita os builders do supabase-js. */
function chain<T>(run: () => Promise<Result<T>>) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () => builder,
    abortSignal: () => builder,
    then<A, B>(
      onFulfilled?: (v: Result<T>) => A | PromiseLike<A>,
      onRejected?: (e: unknown) => B | PromiseLike<B>,
    ) {
      return run().then(onFulfilled, onRejected);
    },
  };
  return builder;
}

export function createFakeSupabase(options: { session?: Session | null } = {}) {
  let session: Session | null = options.session === undefined ? makeSession() : options.session;
  const listeners = new Set<Listener>();
  const emit = (event: AuthChangeEvent, next: Session | null) => {
    session = next;
    for (const l of listeners) l(event, next);
  };

  const db = createFakeDb();
  const state = {
    db,
    profile: makeProfileRow() as Tables<'profiles'> | null,
    profileError: null as Result<unknown>['error'],
    rpc: {
      dashboard_summary: () => Promise.resolve({ data: emptySummaryJson(), error: null }),
      export_my_data: () => Promise.resolve({ data: { format: 'lifeos-export' }, error: null }),
      delete_my_account: () => Promise.resolve({ data: null, error: null }),
    } as Record<string, RpcHandler>,
  };

  const auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener);
      queueMicrotask(() => {
        listener('INITIAL_SESSION', session);
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signInWithPassword: vi.fn(({ email }: { email: string; password: string }) => {
      const next = makeSession(makeUser({ email }));
      emit('SIGNED_IN', next);
      return Promise.resolve({
        data: { session: next, user: next.user },
        error: null as Result<unknown>['error'],
      });
    }),
    signUp: vi.fn(() =>
      Promise.resolve({
        data: { session: null as Session | null, user: makeUser() },
        error: null as Result<unknown>['error'],
      }),
    ),
    signOut: vi.fn(() => {
      emit('SIGNED_OUT', null);
      return Promise.resolve({ error: null });
    }),
    resetPasswordForEmail: vi.fn(() =>
      Promise.resolve({ data: {}, error: null as Result<unknown>['error'] }),
    ),
    updateUser: vi.fn(() => {
      if (session) emit('USER_UPDATED', session);
      return Promise.resolve({
        data: { user: session?.user ?? null },
        error: null as Result<unknown>['error'],
      });
    }),
  };

  const from = vi.fn((table: string) => {
    if (table !== 'profiles') return db.from(table);
    let patch: Partial<Tables<'profiles'>> | null = null;
    const run = (): Promise<Result<Tables<'profiles'>>> => {
      if (state.profileError) return Promise.resolve({ data: null, error: state.profileError });
      if (!state.profile) {
        return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'not found' } });
      }
      if (patch) state.profile = { ...state.profile, ...patch };
      return Promise.resolve({ data: state.profile, error: null });
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: () => builder,
      abortSignal: () => builder,
      update: (p: Partial<Tables<'profiles'>>) => {
        patch = p;
        return builder;
      },
      then<A, B>(
        onFulfilled?: (v: Result<Tables<'profiles'>>) => A | PromiseLike<A>,
        onRejected?: (e: unknown) => B | PromiseLike<B>,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return builder;
  });

  const rpc = vi.fn((name: string, args?: unknown) => {
    const handler = state.rpc[name];
    if (!handler) return db.rpc(name, (args ?? {}) as Record<string, unknown>);
    return chain(() => handler(args));
  });

  const client = { auth, from, rpc } as unknown as LifeosClient;
  return { client, auth, from, rpc, state, emit, getSession: () => session };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
