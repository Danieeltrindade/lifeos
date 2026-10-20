import type { z } from 'zod';

/**
 * Acesso seguro ao localStorage, validado por schema.
 *
 * O localStorage pode lançar exceções (modo privado, cota, bloqueio de cookies) e pode conter
 * valores antigos ou manipulados. Toda leitura é validada; valores inválidos caem no padrão.
 *
 * Uso restrito a preferências locais do dispositivo. Dados pessoais e de negócio pertencem ao
 * backend (Supabase), não ao navegador. Ver docs/decisions.md (ADR-006).
 */
export function readStored<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sem persistência disponível: a preferência vale apenas para esta sessão.
  }
}
