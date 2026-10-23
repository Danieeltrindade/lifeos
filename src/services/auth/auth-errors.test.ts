import { describe, expect, it } from 'vitest';
import {
  authErrorMessage,
  GENERIC_AUTH_MESSAGE,
  isEnumerationError,
  NETWORK_MESSAGE,
} from './auth-errors';

describe('mensagens de autenticação', () => {
  it('traduz códigos conhecidos', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.');
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toMatch(/confirme seu e-mail/i);
    expect(authErrorMessage({ code: 'weak_password' })).toMatch(/senha fraca/i);
    expect(authErrorMessage({ code: 'over_request_rate_limit' })).toMatch(/aguarde/i);
  });

  it('falha de rede tem mensagem própria', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(NETWORK_MESSAGE);
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_MESSAGE);
  });

  it('erro desconhecido não expõe detalhes do servidor', () => {
    expect(authErrorMessage({ code: 'unexpected_failure', message: 'stack trace…' })).toBe(
      GENERIC_AUTH_MESSAGE,
    );
  });

  it('identifica erros que revelariam se um e-mail tem conta', () => {
    expect(isEnumerationError({ code: 'user_already_exists' })).toBe(true);
    expect(isEnumerationError({ code: 'email_exists' })).toBe(true);
    expect(isEnumerationError({ code: 'invalid_credentials' })).toBe(false);
  });
});
