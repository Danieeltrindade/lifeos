import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { browserTimeZone } from '@/lib/date';
import { useTheme } from '@/lib/theme/theme-context';
import { useAuth } from '@/services/auth/auth-context';
import { isAbortError, toAppError, type AppError } from '@/services/supabase/errors';
import { useSupabase } from '@/services/supabase/supabase-context';
import {
  ProfileContext,
  type ProfileContextValue,
  type ProfileState,
  type ProfileUpdateResult,
} from './profile-context';
import { fetchProfile, updateProfile, type Profile, type ProfilePatch } from './profile-repository';

type Settled =
  { key: string; ok: true; profile: Profile } | { key: string; ok: false; error: AppError };

/**
 * Perfil do usuário autenticado (fuso, início da semana, tema). Carregado uma vez por
 * sessão e compartilhado pela aplicação; é a fonte do fuso usado em todas as datas.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const client = useSupabase();
  const { state: auth, handleSessionExpired } = useAuth();
  const userId = auth.status === 'signed_in' ? auth.user.id : null;
  const [attempt, setAttempt] = useState(0);
  const key = userId ? `${userId}#${attempt}` : null;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!userId || !key) return;
    const controller = new AbortController();
    fetchProfile(client, userId, controller.signal).then(
      (profile) => {
        if (!controller.signal.aborted) setSettled({ key, ok: true, profile });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        const appError = toAppError(error);
        if (appError.kind === 'session_expired') handleSessionExpired();
        setSettled({ key, ok: false, error: appError });
      },
    );
    return () => {
      controller.abort();
    };
  }, [client, userId, key, handleSessionExpired]);

  // Estado derivado: sem setState síncrono em efeitos.
  const state: ProfileState = useMemo(() => {
    if (!key) return { status: 'idle' };
    if (settled?.key !== key) return { status: 'loading' };
    return settled.ok
      ? { status: 'ready', profile: settled.profile }
      : { status: 'error', error: settled.error };
  }, [key, settled]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const update = useCallback(
    async (patch: ProfilePatch): Promise<ProfileUpdateResult> => {
      if (!userId || !key) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
      try {
        const profile = await updateProfile(client, userId, patch);
        setSettled({ key, ok: true, profile });
        return { ok: true, profile };
      } catch (error) {
        const appError = toAppError(error);
        if (appError.kind === 'session_expired') handleSessionExpired();
        return { ok: false, message: appError.message };
      }
    },
    [client, userId, key, handleSessionExpired],
  );

  const timezone = state.status === 'ready' ? state.profile.timezone : browserTimeZone();

  const value = useMemo<ProfileContextValue>(
    () => ({ state, timezone, reload, update }),
    [state, timezone, reload, update],
  );

  return (
    <ProfileContext value={value}>
      <ThemeProfileSync value={value} />
      {children}
    </ProfileContext>
  );
}

/**
 * Mantém o tema do dispositivo e o do perfil em acordo:
 *  - ao carregar o perfil, a preferência salva na conta é aplicada neste navegador;
 *  - depois disso, uma mudança feita pelo usuário é gravada no perfil.
 * O localStorage continua como cache para aplicar o tema antes da primeira pintura.
 */
function ThemeProfileSync({ value }: { value: ProfileContextValue }) {
  const { preference, setPreference } = useTheme();
  const appliedFor = useRef<string | null>(null);
  const profile = value.state.status === 'ready' ? value.state.profile : null;
  const { update } = value;

  useEffect(() => {
    if (!profile) {
      if (value.state.status === 'idle') appliedFor.current = null;
      return;
    }
    if (appliedFor.current !== profile.id) {
      appliedFor.current = profile.id;
      if (profile.themePreference !== preference) setPreference(profile.themePreference);
      return;
    }
    if (preference !== profile.themePreference) {
      void update({ themePreference: preference });
    }
  }, [profile, preference, setPreference, update, value.state.status]);

  return null;
}
