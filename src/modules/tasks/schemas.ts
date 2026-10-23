import { z } from 'zod';
import { optionalDate, optionalId, optionalInt, optionalText, requiredText } from '@/lib/forms';

/** Mesmas regras das constraints de public.tasks. */
export const taskFormSchema = z
  .object({
    title: requiredText(200, 'o título'),
    description: optionalText(4000),
    priority: z.enum(['low', 'medium', 'high']),
    startOn: optionalDate,
    dueOn: optionalDate,
    estimateMinutes: optionalInt(1, 10080, 'tempo em minutos'),
    projectId: optionalId,
    parentTaskId: optionalId,
    categoryId: optionalId,
    goalId: optionalId,
    notes: optionalText(10000),
  })
  .refine((v) => !v.startOn || !v.dueOn || v.dueOn >= v.startOn, {
    error: 'O prazo não pode ser antes da data de início.',
    path: ['dueOn'],
  });

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;
