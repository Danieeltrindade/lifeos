import { createContext, use } from 'react';
import type { AppError } from '@/services/supabase/errors';
import type { Profile, ProfilePatch } from './profile-repository';

export type ProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile }
  | { status: 'error'; error: AppError };

export type ProfileUpdateResult = { ok: true; profile: Profile } | { ok: false; message: string };

export interface ProfileContextValue {
  state: ProfileState;
  /** Fuso efetivo para exibir datas: o do perfil; o do navegador enquanto o perfil carrega. */
  timezone: string;
  reload: () => void;
  update: (patch: ProfilePatch) => Promise<ProfileUpdateResult>;
}

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile(): ProfileContextValue {
  const ctx = use(ProfileContext);
  if (!ctx) throw new Error('useProfile deve ser usado dentro de <ProfileProvider>.');
  return ctx;
}
