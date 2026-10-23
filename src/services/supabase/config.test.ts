import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from './config';

function jwt(payload: object): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}

describe('configuração pública do Supabase', () => {
  it('aceita URL https e chave publishable', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co/',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
    });
    expect(result).toEqual({
      ok: true,
      config: { url: 'https://abcdefgh.supabase.co', publishableKey: 'sb_publishable_abc123' },
    });
  });

  it('aceita a chave anon legada (JWT com role anon) e http em localhost', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'anon' }),
    });
    expect(result.ok).toBe(true);
  });

  it('exige as duas variáveis', () => {
    const result = readSupabaseConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toHaveLength(2);
  });

  it('RECUSA a chave service_role (ignora RLS) no navegador', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toMatch(/service_role/);
  });

  it('RECUSA a secret key no navegador', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc123',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toMatch(/SECRETA/);
  });

  it('recusa http fora de localhost e valores que não parecem chaves', () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: 'http://abcdefgh.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'qualquer-coisa',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toHaveLength(2);
  });
});
