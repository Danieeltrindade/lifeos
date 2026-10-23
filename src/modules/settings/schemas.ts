import { z } from 'zod';
import { isValidTimeZone } from '@/lib/date';

/** Valores do seletor "a semana começa" (0 = domingo … 6 = sábado). */
export const WEEKDAY_VALUES = ['0', '1', '2', '3', '4', '5', '6'] as const;
export type WeekdayValue = (typeof WEEKDAY_VALUES)[number];

export function weekdayValue(day: number): WeekdayValue {
  return WEEKDAY_VALUES[day] ?? '1';
}

/** Mesmas regras das constraints de public.profiles (o banco é a validação definitiva). */
export const profileFormSchema = z.object({
  displayName: z.string().trim().max(80, { error: 'Use no máximo 80 caracteres.' }),
  timezone: z.string().refine(isValidTimeZone, { error: 'Escolha um fuso horário válido.' }),
  weekStartsOn: z.enum(WEEKDAY_VALUES).transform(Number),
});

export const DELETE_CONFIRMATION = 'EXCLUIR';

export const deleteAccountSchema = z.object({
  password: z.string().min(1, { error: 'Informe sua senha.' }),
  confirmation: z
    .string()
    .trim()
    .refine((v) => v === DELETE_CONFIRMATION, {
      error: `Digite ${DELETE_CONFIRMATION} para confirmar.`,
    }),
});
