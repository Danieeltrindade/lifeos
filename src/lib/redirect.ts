/**
 * Valida o destino pós-login vindo da URL (?redirectTo=…).
 * Só aceita caminhos internos: evita "open redirect" (ex.: ?redirectTo=//site-malicioso.com).
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  try {
    const url = new URL(value, 'https://lifeos.invalid');
    if (url.origin !== 'https://lifeos.invalid') return fallback;
    // Não volta para telas de autenticação depois de entrar.
    if (AUTH_PATHS.some((p) => url.pathname === p)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export const AUTH_PATHS = ['/entrar', '/cadastro', '/recuperar-senha', '/redefinir-senha'] as const;

/** Monta a URL de login preservando o destino atual. */
export function signInPathFor(pathname: string, search = ''): string {
  const target = pathname + search;
  if (target === '/' || AUTH_PATHS.some((p) => pathname === p)) return '/entrar';
  return `/entrar?redirectTo=${encodeURIComponent(target)}`;
}
