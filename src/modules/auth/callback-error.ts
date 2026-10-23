import { authErrorMessage, GENERIC_AUTH_MESSAGE } from '@/services/auth/auth-errors';

/**
 * Quando um link de e-mail falha (expirado, já usado, aberto em outro navegador), o
 * Supabase volta para a aplicação com ?error=…&error_code=… (ou no fragmento #).
 * Converte isso numa mensagem segura; nunca exibe error_description cru.
 */
export function readAuthCallbackError(search: string, hash: string): string | null {
  const params = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const error = params.get('error') ?? fragment.get('error');
  if (!error) return null;
  const code = params.get('error_code') ?? fragment.get('error_code') ?? error;
  const message = authErrorMessage({ code });
  return message === GENERIC_AUTH_MESSAGE ? 'O link é inválido ou expirou. Peça um novo.' : message;
}
