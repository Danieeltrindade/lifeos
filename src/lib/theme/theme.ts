import { z } from 'zod';
import { readStored, writeStored } from '@/lib/storage';

/**
 * Regras de tema (puras e testáveis), separadas do React.
 * A mesma chave e os mesmos valores são usados pelo script inline em index.html.
 */
export const THEME_STORAGE_KEY = 'lifeos:theme';

export const themePreferenceSchema = z.enum(['light', 'dark', 'system']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function readThemePreference(): ThemePreference {
  return readStored(THEME_STORAGE_KEY, themePreferenceSchema, DEFAULT_THEME_PREFERENCE);
}

export function persistThemePreference(preference: ThemePreference): void {
  writeStored(THEME_STORAGE_KEY, preference);
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
