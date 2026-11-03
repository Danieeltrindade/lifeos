import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PALETTE,
  PALETTE_IDS,
  PALETTE_STORAGE_KEY,
  PALETTES,
  parsePalette,
  readPalette,
} from './palettes';

describe('paletas de cores', () => {
  it('são 11 (10 coloridas + Mono), com Ocean como padrão', () => {
    expect(PALETTE_IDS).toHaveLength(11);
    expect(PALETTE_IDS).toContain('mono');
    expect(PALETTES.map((p) => p.id)).toEqual([...PALETTE_IDS]);
    expect(DEFAULT_PALETTE).toBe('ocean');
  });

  it('valor salvo desconhecido ou ausente volta para Ocean', () => {
    expect(parsePalette('nebula')).toBe('nebula');
    expect(parsePalette('neon')).toBe('ocean');
    expect(parsePalette(null)).toBe('ocean');
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'tema-removido');
    expect(readPalette()).toBe('ocean');
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'gold');
    expect(readPalette()).toBe('gold');
  });
});
