import { parsePalette, type PaletteId } from '@/lib/theme/palettes';
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
  /**
   * Paleta de cores salva na conta. `null` quando o banco ainda não tem a coluna
   * (migration 20261103120000_theme_color não aplicada): a paleta vale só neste navegador.
   */
  themeColor: PaletteId | null;
  emailNotifications: boolean;
}

export type ProfilePatch = Partial<Omit<Profile, 'id' | 'themeColor'>> & { themeColor?: PaletteId };

const BASE_COLUMNS =
  'id, display_name, timezone, week_starts_on, theme_preference, email_notifications';
const COLUMNS = `${BASE_COLUMNS}, theme_color`;

type ProfileRow = Pick<
  Tables<'profiles'>,
  'id' | 'display_name' | 'timezone' | 'week_starts_on' | 'theme_preference' | 'email_notifications'
> & { theme_color?: string | null };

/**
 * O banco do usuário ainda não tem profiles.theme_color? (PostgREST: 42703 na leitura,
 * PGRST204 na escrita.) Nesse caso o perfil continua funcionando sem a paleta.
 */
function isMissingThemeColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    (error.code === '42703' || error.code === 'PGRST204') &&
    (error.message ?? '').includes('theme_color')
  );
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    themePreference: themePreferenceSchema.catch('system').parse(row.theme_preference),
    themeColor: row.theme_color === undefined ? null : parsePalette(row.theme_color),
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
  if (patch.themeColor !== undefined) row.theme_color = patch.themeColor;
  if (patch.emailNotifications !== undefined) row.email_notifications = patch.emailNotifications;
  return row;
}

export async function fetchProfile(
  client: LifeosClient,
  userId: string,
  signal?: AbortSignal,
): Promise<Profile> {
  const run = (columns: string) => {
    let query = client.from('profiles').select(columns).eq('id', userId);
    if (signal) query = query.abortSignal(signal);
    return query.single<ProfileRow>();
  };
  let { data, error } = await run(COLUMNS);
  if (isMissingThemeColumn(error)) ({ data, error } = await run(BASE_COLUMNS));
  if (error) throw toAppError(error);
  return toProfile(data as ProfileRow);
}

export async function updateProfile(
  client: LifeosClient,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const run = (row: TablesUpdate<'profiles'>, columns: string) =>
    client.from('profiles').update(row).eq('id', userId).select(columns).single<ProfileRow>();
  let { data, error } = await run(toProfileUpdate(patch), COLUMNS);
  if (isMissingThemeColumn(error)) {
    // Sem a coluna no banco: grava o restante e mantém a paleta só neste navegador.
    const rest: ProfilePatch = { ...patch };
    delete rest.themeColor;
    const row = toProfileUpdate(rest);
    if (Object.keys(row).length === 0) return fetchProfile(client, userId);
    ({ data, error } = await run(row, BASE_COLUMNS));
  }
  if (error) throw toAppError(error);
  return toProfile(data as ProfileRow);
}
