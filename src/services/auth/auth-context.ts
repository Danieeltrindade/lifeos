import type { Session, User } from '@supabase/supabase-js';
import { createContext, use } from 'react';

/** Por que não há sessão — usado para explicar ao usuário o redirecionamento. */
export type SignedOutReason = 'initial' | 'signed_out' | 'expired' | 'account_deleted';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; reason: SignedOutReason }
  | {
      status: 'signed_in';
      session: Session;
      user: User;
      /** Sessão aberta por um link de recuperação de senha. */
      recovery: boolean;
    };

export type AuthResult = { ok: true } | { ok: false; message: string };

export type SignUpResult =
  { ok: true; needsEmailConfirmation: boolean } | { ok: false; message: string };

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
  timezone: string;
}

export interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  /** Confirma a identidade do usuário logado pedindo a senha de novo (ações destrutivas). */
  reauthenticate: (password: string) => Promise<AuthResult>;
  /** Chamado pela camada de dados quando o servidor recusa o token (sessão expirada). */
  handleSessionExpired: () => void;
  /** Encerra a sessão local depois que a conta foi excluída no servidor. */
  handleAccountDeleted: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}
