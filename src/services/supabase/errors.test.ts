import { describe, expect, it } from 'vitest';
import { APP_ERROR_MESSAGES, AppError, isAbortError, toAppError } from './errors';

describe('tradução de erros do Supabase', () => {
  it.each([
    [{ code: 'PGRST303', message: 'JWT expired' }, 'session_expired'],
    [{ code: 'PGRST301', message: 'JWT invalid' }, 'session_expired'],
    [
      { code: '42501', message: 'new row violates row-level security policy for table "tasks"' },
      'permission',
    ],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, 'conflict'],
    [{ code: '23514', message: 'violates check constraint' }, 'validation'],
    [{ code: '23503', message: 'violates foreign key constraint' }, 'validation'],
    [{ code: 'PGRST116', message: '0 rows' }, 'not_found'],
    [{ code: 'XX000', message: 'internal' }, 'unknown'],
  ])('%o → %s', (error, kind) => {
    expect(toAppError(error).kind).toBe(kind);
  });

  it('falha de rede vira mensagem de conexão', () => {
    const appError = toAppError(new TypeError('Failed to fetch'));
    expect(appError.kind).toBe('network');
    expect(appError.message).toBe(APP_ERROR_MESSAGES.network);
  });

  it('nunca repassa a mensagem crua do banco (pode conter nomes internos ou dados)', () => {
    const raw = 'new row violates row-level security policy for table "diary_entries"';
    const appError = toAppError({ code: '42501', message: raw });
    expect(appError.message).not.toContain('diary_entries');
    expect(appError.message).toBe(APP_ERROR_MESSAGES.permission);
    expect(appError.code).toBe('42501');
  });

  it('reconhece cancelamentos (troca de tela) para não exibir erro', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(toAppError(new DOMException('Aborted', 'AbortError')))).toBe(true);
    expect(isAbortError(new AppError('network', 'x'))).toBe(false);
  });

  it('mensagens escritas pelo LifeOS no banco são exibidas (são para o usuário)', () => {
    const appError = toAppError({
      code: '23514',
      message: 'Conclua antes as tarefas de que esta depende: Ler capítulo 2',
    });
    expect(appError.kind).toBe('validation');
    expect(appError.message).toBe('Conclua antes as tarefas de que esta depende: Ler capítulo 2');
  });

  it('restrições conhecidas viram mensagens específicas, sem o nome interno', () => {
    const appError = toAppError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "habit_checkins_one_per_day"',
    });
    expect(appError.message).toBe('Já existe uma marcação deste hábito nesse dia.');
    expect(appError.message).not.toContain('habit_checkins');
  });

  it('mensagens desconhecidas continuam genéricas', () => {
    expect(toAppError({ code: '23514', message: 'algo interno "tabela_x"' }).message).toBe(
      APP_ERROR_MESSAGES.validation,
    );
  });
});
