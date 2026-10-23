import { themePreferenceSchema, type ThemePreference } from '@/lib/theme/theme';
import type { LifeosClient } from '@/services/supabase/client';
import type { Tables, TablesUpdate } from '@/services/supabase/database.types';
import { toAppError } from '@/services/supabase/errors';

/** Perfil na forma usada pela interface (camelCase). */
export interface Profile {
  id: string;
  displayName: string;
  timezone: string;
  /** 0 = domingo … 6 = sábado */
  weekStartsOn: number;
  themePreference: ThemePreference;
  emailNotifications: boolean;
}

export type ProfilePatch = Partial<Omit<Profile, 'id'>>;

const COLUMNS = 'id, display_name, timezone, week_starts_on, theme_preference, email_notifications';

type ProfileRow = Pick<
  Tables<'profiles'>,
  'id' | 'display_name' | 'timezone' | 'week_starts_on' | 'theme_preference' | 'email_notifications'
>;

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    themePreference: themePreferenceSchema.catch('system').parse(row.theme_preference),
    emailNotifications: row.email_notifications,
  };
}

/** Apenas as colunas que o papel authenticated pode alterar (GRANT por coluna no banco). */
export function toProfileUpdate(patch: ProfilePatch): TablesUpdate<'profiles'> {
  const row: TablesUpdate<'profiles'> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName.trim();
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.weekStartsOn !== undefined) row.week_starts_on = patch.weekStartsOn;
  if (patch.themePreference !== undefined) row.theme_preference = patch.themePreference;
  if (patch.emailNotifications !== undefined) row.email_notifications = patch.emailNotifications;
  return row;
}

export async function fetchProfile(
  client: LifeosClient,
  userId: string,
  signal?: AbortSignal,
): Promise<Profile> {
  let query = client.from('profiles').select(COLUMNS).eq('id', userId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.single();
  if (error) throw toAppError(error);
  return toProfile(data);
}

export async function updateProfile(
  client: LifeosClient,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .update(toProfileUpdate(patch))
    .eq('id', userId)
    .select(COLUMNS)
    .single();
  if (error) throw toAppError(error);
  return toProfile(data);
}
