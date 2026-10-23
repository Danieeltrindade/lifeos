/**
 * Configuração pública do Supabase lida das variáveis de ambiente do Vite.
 *
 * Tudo que começa com VITE_ vai para o bundle público. Por isso a validação RECUSA
 * chaves privilegiadas (service_role / secret): se alguém colar a chave errada no
 * .env.local, o app não inicia em vez de expor acesso total ao banco.
 */

export interface SupabaseConfig {
  url: string;
  /** Chave pública: "publishable" (sb_publishable_…) ou a "anon" legada (JWT). */
  publishableKey: string;
}

export type SupabaseConfigResult =
  { ok: true; config: SupabaseConfig } | { ok: false; problems: string[] };

interface RawEnv {
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (typeof payload === 'object' && payload !== null && 'role' in payload) {
      return typeof payload.role === 'string' ? payload.role : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function readSupabaseConfig(env: RawEnv): SupabaseConfigResult {
  const problems: string[] = [];
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  if (!url) {
    problems.push('VITE_SUPABASE_URL não foi definida.');
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      problems.push('VITE_SUPABASE_URL não é uma URL válida.');
    }
    if (parsed) {
      const local = LOCAL_HOSTS.has(parsed.hostname);
      if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
        problems.push('VITE_SUPABASE_URL precisa usar https (http só é aceito para localhost).');
      }
    }
  }

  if (!key) {
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY não foi definida.');
  } else if (key.startsWith('sb_secret_')) {
    problems.push(
      'A chave informada é SECRETA (sb_secret_…). Use a chave publishable; a secreta nunca pode ir para o navegador.',
    );
  } else if (decodeJwtRole(key) === 'service_role') {
    problems.push(
      'A chave informada é a service_role. Use a chave anon/publishable; a service_role ignora o RLS e nunca pode ir para o navegador.',
    );
  } else if (!key.startsWith('sb_publishable_') && decodeJwtRole(key) !== 'anon') {
    problems.push(
      'VITE_SUPABASE_PUBLISHABLE_KEY não parece uma chave publishable (sb_publishable_…) ou anon.',
    );
  }

  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, config: { url: url.replace(/\/+$/, ''), publishableKey: key } };
}
