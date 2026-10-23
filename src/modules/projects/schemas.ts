import { z } from 'zod';
import { optionalDate, optionalText, requiredText } from '@/lib/forms';

export const projectFormSchema = z
  .object({
    name: requiredText(120, 'o nome'),
    description: optionalText(4000),
    status: z.enum(['planned', 'active', 'on_hold', 'completed', 'cancelled']),
    priority: z.enum(['low', 'medium', 'high']),
    startOn: optionalDate,
    dueOn: optionalDate,
    notes: optionalText(10000),
  })
  .refine((v) => !v.startOn || !v.dueOn || v.dueOn >= v.startOn, {
    error: 'O prazo não pode ser antes do início.',
    path: ['dueOn'],
  });

export type ProjectFormInput = z.input<typeof projectFormSchema>;
