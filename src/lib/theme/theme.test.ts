import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('resolveTheme', () => {
  it('respeita escolhas explícitas independentemente do sistema', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('segue o sistema operacional quando a preferência é "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('persistência da preferência', () => {
  it('usa "system" quando não há valor salvo', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('lê o valor salvo', () => {
    persistThemePreference('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference()).toBe('dark');
  });

  it('descarta valores inválidos ou adulterados', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readThemePreference()).toBe('system');
  });
});

describe('applyTheme', () => {
  it('define data-theme e color-scheme no elemento raiz', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });
});
