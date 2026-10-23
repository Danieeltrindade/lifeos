/**
 * Caminhos para onde os e-mails do Supabase Auth trazem o usuário de volta.
 * A origem + cada caminho precisa constar em Authentication → URL Configuration →
 * Redirect URLs no painel do Supabase (ver docs/supabase-setup.md).
 */
export const AUTH_REDIRECT_PATHS = {
  emailConfirmed: '/entrar?confirmado=1',
  passwordReset: '/redefinir-senha',
} as const;
