import { z } from 'zod';

/**
 * Pré-processadores de formulário: inputs HTML entregam strings; o banco espera null
 * para "vazio". Mesmas regras das constraints SQL (o banco continua sendo a validação final).
 */
export const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), { error: 'Data inválida.' });

export const optionalId = z.string().transform((v) => (v === '' ? null : v));

export function optionalInt(min: number, max: number, label = 'valor') {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return null;
      const n = Number(v.replace(',', '.'));
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({
          code: 'custom',
          message: `Informe um ${label} inteiro entre ${String(min)} e ${String(max)}.`,
        });
        return z.NEVER;
      }
      return n;
    });
}

export function optionalNumber(min: number, max: number, label = 'valor') {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return null;
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({
          code: 'custom',
          message: `Informe um ${label} entre ${String(min)} e ${String(max)}.`,
        });
        return z.NEVER;
      }
      return n;
    });
}

export function requiredText(max: number, label: string) {
  return z
    .string()
    .trim()
    .min(1, { error: `Informe ${label}.` })
    .max(max, { error: `Use no máximo ${String(max)} caracteres.` });
}

export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Use no máximo ${String(max)} caracteres.` });
}

/** Valor de input a partir de um campo possivelmente nulo. */
export const inputValue = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);
