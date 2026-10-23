import { describe, expect, it } from 'vitest';
import { safeRedirectPath, signInPathFor } from './redirect';

describe('redirecionamento pós-login', () => {
  it('aceita caminhos internos', () => {
    expect(safeRedirectPath('/tarefas')).toBe('/tarefas');
    expect(safeRedirectPath('/estudos?aba=revisoes#hoje')).toBe('/estudos?aba=revisoes#hoje');
  });

  it.each([
    'https://malicioso.com',
    '//malicioso.com',
    '/\\malicioso.com',
    'javascript:alert(1)',
    'tarefas',
  ])('recusa destino externo ou inválido: %s', (value) => {
    expect(safeRedirectPath(value)).toBe('/');
  });

  it('não volta para telas de autenticação', () => {
    expect(safeRedirectPath('/entrar')).toBe('/');
    expect(safeRedirectPath('/cadastro')).toBe('/');
  });

  it('monta a URL de login preservando o destino', () => {
    expect(signInPathFor('/tarefas', '?filtro=hoje')).toBe(
      '/entrar?redirectTo=%2Ftarefas%3Ffiltro%3Dhoje',
    );
    expect(signInPathFor('/')).toBe('/entrar');
  });
});
