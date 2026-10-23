import { z } from 'zod';

/**
 * Validação dos formulários de autenticação (feedback imediato). A regra definitiva
 * é aplicada pelo Supabase Auth (política de senha) — estes limites a acompanham.
 *
 * Senha: mínimo 8 (recomendado configurar o mesmo mínimo no painel) e máximo 72
 * caracteres (limite do bcrypt usado pelo Supabase Auth).
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Informe um e-mail válido.' }));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, { error: `Use pelo menos ${PASSWORD_MIN} caracteres.` })
  .max(PASSWORD_MAX, { error: `Use no máximo ${PASSWORD_MAX} caracteres.` });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Informe sua senha.' }),
});

export const signUpSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, { error: 'Informe como quer ser chamado.' })
      .max(80, { error: 'Use no máximo 80 caracteres.' }),
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    error: 'As senhas não coincidem.',
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    error: 'As senhas não coincidem.',
  });
