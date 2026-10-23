import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSupabase } from '@/services/supabase/supabase-context';
import {
  AuthContext,
  type AuthContextValue,
  type AuthResult,
  type AuthState,
  type SignedOutReason,
  type SignUpInput,
  type SignUpResult,
} from './auth-context';
import { authErrorMessage, isEnumerationError } from './auth-errors';
import { AUTH_REDIRECT_PATHS } from './auth-redirects';

function signedIn(session: Session, recovery: boolean): AuthState {
  return { status: 'signed_in', session, user: session.user, recovery };
}

function origin(): string {
  return window.location.origin;
}

/**
 * Fonte única do estado de autenticação. A sessão vem do supabase-js (persistida no
 * localStorage e renovada automaticamente); este provider apenas a observa e expõe ações
 * com mensagens de erro seguras. Nenhuma sessão é simulada.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useSupabase();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  // Motivo do próximo SIGNED_OUT quando a saída foi provocada pelo próprio app.
  const pendingSignOutReason = useRef<SignedOutReason | null>(null);

  useEffect(() => {
    let active = true;

    const onChange = (event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      if (!session) {
        const reason =
          pendingSignOutReason.current ?? (event === 'SIGNED_OUT' ? 'expired' : 'initial');
        pendingSignOutReason.current = null;
        setState({ status: 'signed_out', reason });
        return;
      }
      setState((prev) => {
        const wasRecovery = prev.status === 'signed_in' && prev.recovery;
        const recovery =
          event === 'PASSWORD_RECOVERY' ||
          (wasRecovery && event !== 'USER_UPDATED' && event !== 'SIGNED_IN');
        return signedIn(session, recovery);
      });
    };

    const { data } = client.auth.onAuthStateChange(onChange);

    // Garante a saída do estado "loading" mesmo se INITIAL_SESSION não chegar.
    void client.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!active) return;
        setState((prev) => {
          if (prev.status !== 'loading') return prev;
          return session ? signedIn(session, false) : { status: 'signed_out', reason: 'initial' };
        });
      })
      .catch(() => {
        if (!active) return;
        setState((prev) =>
          prev.status === 'loading' ? { status: 'signed_out', reason: 'initial' } : prev,
        );
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
      } catch (error) {
        return { ok: false, message: authErrorMessage(error) };
      }
    },
    [client],
  );

  const signUp = useCallback(
    async (input: SignUpInput): Promise<SignUpResult> => {
      try {
        const { data, error } = await client.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: origin() + AUTH_REDIRECT_PATHS.emailConfirmed,
            // Metadados não sensíveis, validados de novo pelo trigger do banco.
            data: { display_name: input.displayName, timezone: input.timezone },
          },
        });
        if (error) {
          // Mesma resposta para e-mail já cadastrado: não revela quem tem conta.
          if (isEnumerationError(error)) return { ok: true, needsEmailConfirmation: true };
          return { ok: false, message: authErrorMessage(error) };
        }
        return { ok: true, needsEmailConfirmation: data.session === null };
      } catch (error) {
        return { ok: false, message: authErrorMessage(error) };
      }
    },
    [client],
  );

  const signOutWith = useCallback(
    async (reason: SignedOutReason) => {
      pendingSignOutReason.current = reason;
      try {
        await client.auth.signOut({ scope: 'local' });
      } finally {
        // Mesmo sem rede, a sessão local deixa de valer neste navegador.
        setState((prev) =>
          prev.status === 'signed_out' ? prev : { status: 'signed_out', reason },
        );
      }
    },
    [client],
  );

  const signOut = useCallback(() => signOutWith('signed_out'), [signOutWith]);

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: origin() + AUTH_REDIRECT_PATHS.passwordReset,
        });
        // Erros que revelariam a existência da conta são tratados como sucesso.
        if (error && !isEnumerationError(error) && error.code !== 'user_not_found') {
          return { ok: false, message: authErrorMessage(error) };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, message: authErrorMessage(error) };
      }
    },
    [client],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      try {
        const { error } = await client.auth.updateUser({ password });
        return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
      } catch (error) {
        return { ok: false, message: authErrorMessage(error) };
      }
    },
    [client],
  );

  const reauthenticate = useCallback(
    async (password: string): Promise<AuthResult> => {
      if (state.status !== 'signed_in' || !state.user.email) {
        return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
      }
      try {
        const { error } = await client.auth.signInWithPassword({
          email: state.user.email,
          password,
        });
        if (!error) return { ok: true };
        return {
          ok: false,
          message:
            error.code === 'invalid_credentials' ? 'Senha incorreta.' : authErrorMessage(error),
        };
      } catch (error) {
        return { ok: false, message: authErrorMessage(error) };
      }
    },
    [client, state],
  );

  const handleSessionExpired = useCallback(() => {
    void signOutWith('expired');
  }, [signOutWith]);

  const handleAccountDeleted = useCallback(() => signOutWith('account_deleted'), [signOutWith]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      reauthenticate,
      handleSessionExpired,
      handleAccountDeleted,
    }),
    [
      state,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      reauthenticate,
      handleSessionExpired,
      handleAccountDeleted,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
