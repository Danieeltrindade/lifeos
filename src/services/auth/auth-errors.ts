/**
 * Mensagens de erro de autenticação em pt-BR.
 *
 * Princípios:
 *  - nunca revelar se um e-mail está cadastrado (cadastro e recuperação respondem igual);
 *  - nunca exibir a mensagem crua do servidor;
 *  - orientar o próximo passo.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed:
    'Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras, números e símbolos.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.',
  signup_disabled: 'Novos cadastros estão desativados no momento.',
  email_address_invalid: 'Este endereço de e-mail não pode ser usado.',
  email_address_not_authorized: 'Este endereço de e-mail não pode ser usado.',
  validation_failed: 'Verifique os dados informados.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
  session_expired: 'Sua sessão expirou. Entre novamente.',
  refresh_token_not_found: 'Sua sessão expirou. Entre novamente.',
  refresh_token_already_used: 'Sua sessão expirou. Entre novamente.',
  otp_expired: 'O link expirou ou já foi usado. Peça um novo.',
  flow_state_expired: 'O link expirou. Peça um novo.',
  flow_state_not_found:
    'O link não pode ser usado neste navegador. Abra-o no mesmo navegador em que fez o pedido, ou peça um novo.',
  bad_code_verifier:
    'O link não pode ser usado neste navegador. Abra-o no mesmo navegador em que fez o pedido, ou peça um novo.',
  reauthentication_needed: 'Por segurança, entre novamente antes de continuar.',
};

/** Erros de cadastro que, se mostrados, revelariam que o e-mail já existe. */
const ENUMERATION_CODES = new Set([
  'user_already_exists',
  'email_exists',
  'identity_already_exists',
]);

export const NETWORK_MESSAGE =
  'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
export const GENERIC_AUTH_MESSAGE =
  'Não foi possível concluir agora. Tente novamente em instantes.';

interface AuthErrorLike {
  code?: unknown;
  name?: unknown;
  status?: unknown;
}

export function isEnumerationError(error: unknown): boolean {
  const e = (typeof error === 'object' && error !== null ? error : {}) as AuthErrorLike;
  return typeof e.code === 'string' && ENUMERATION_CODES.has(e.code);
}

export function authErrorMessage(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as AuthErrorLike;
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || error instanceof TypeError) {
    return NETWORK_MESSAGE;
  }
  if (typeof e.code === 'string') {
    const message = MESSAGES[e.code];
    if (message) return message;
  }
  if (e.status === 429) return MESSAGES.over_request_rate_limit ?? GENERIC_AUTH_MESSAGE;
  return GENERIC_AUTH_MESSAGE;
}
