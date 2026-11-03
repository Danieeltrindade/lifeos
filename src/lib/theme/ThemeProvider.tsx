import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  DARK_MEDIA_QUERY,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  type ThemePreference,
} from './theme';
import { applyPalette, persistPalette, readPalette, type PaletteId } from './palettes';
import { ThemeContext } from './theme-context';

/**
 * Troca suave de cores: durante ~250 ms, fundos, bordas e textos fazem transição (classe no
 * <html>). Com "reduzir movimento", a regra global de index.css zera a duração.
 */
function withColorTransition(change: () => void) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  change();
  window.setTimeout(() => {
    root.classList.remove('theme-transition');
  }, 260);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);
  const [palette, setPaletteState] = useState<PaletteId>(readPalette);

  // Acompanha mudanças do sistema operacional enquanto a preferência for "system".
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  const setPreference = useCallback((next: ThemePreference) => {
    withColorTransition(() => {
      setPreferenceState(next);
    });
    persistThemePreference(next);
  }, []);

  const setPalette = useCallback((next: PaletteId) => {
    withColorTransition(() => {
      setPaletteState(next);
    });
    persistPalette(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, palette, setPalette }),
    [preference, resolved, setPreference, palette, setPalette],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
