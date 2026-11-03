import { createContext, use } from 'react';
import type { PaletteId } from './palettes';
import type { ResolvedTheme, ThemePreference } from './theme';

export interface ThemeContextValue {
  /** Modo de aparência escolhido (claro, escuro ou sistema). */
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Paleta de cores, independente do modo. */
  palette: PaletteId;
  setPalette: (palette: PaletteId) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}
