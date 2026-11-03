import { z } from 'zod';
import { readStored, writeStored } from '@/lib/storage';

/**
 * Paletas de cores (tema de cores) — independentes do modo claro/escuro.
 *
 * As cores em si ficam em src/styles/themes.css (gerado por scripts/generate-themes.mjs);
 * aqui ficam só a lista, os nomes e a persistência. A mesma lista existe no CHECK do banco
 * (profiles.theme_color, migrations 20261103120000 e 20261103130000) e em public/theme-init.js.
 */
export const PALETTE_IDS = [
  'ocean',
  'nebula',
  'forest',
  'ember',
  'midnight',
  'rose',
  'crimson',
  'amethyst',
  'gold',
  'arctic',
  'mono',
] as const;

export const paletteSchema = z.enum(PALETTE_IDS);
export type PaletteId = z.infer<typeof paletteSchema>;

export const DEFAULT_PALETTE: PaletteId = 'ocean';
export const PALETTE_STORAGE_KEY = 'lifeos:accent';

export interface PaletteInfo {
  id: PaletteId;
  name: string;
  color: string;
  description: string;
}

export const PALETTES: readonly PaletteInfo[] = [
  { id: 'ocean', name: 'Ocean', color: 'Turquesa', description: 'Tecnológico e equilibrado' },
  { id: 'nebula', name: 'Nebula', color: 'Roxo', description: 'Criativo e sofisticado' },
  { id: 'forest', name: 'Forest', color: 'Verde', description: 'Natural e tranquilo' },
  { id: 'ember', name: 'Ember', color: 'Laranja', description: 'Energético e acolhedor' },
  { id: 'midnight', name: 'Midnight', color: 'Azul', description: 'Profissional e focado' },
  { id: 'rose', name: 'Rose', color: 'Rosa', description: 'Moderno e delicado' },
  { id: 'crimson', name: 'Crimson', color: 'Vermelho', description: 'Forte e marcante' },
  { id: 'amethyst', name: 'Amethyst', color: 'Índigo', description: 'Elegante e discreto' },
  { id: 'gold', name: 'Gold', color: 'Dourado', description: 'Premium e clássico' },
  { id: 'arctic', name: 'Arctic', color: 'Azul-gelo', description: 'Minimalista e limpo' },
  {
    id: 'mono',
    name: 'Mono',
    color: 'Preto e branco',
    description: 'Minimalista, monocromático e elegante',
  },
];

/** Valor salvo (no navegador ou no banco) → paleta válida; desconhecido vira Ocean. */
export function parsePalette(value: unknown): PaletteId {
  return paletteSchema.catch(DEFAULT_PALETTE).parse(value);
}

export function readPalette(): PaletteId {
  return readStored(PALETTE_STORAGE_KEY, paletteSchema, DEFAULT_PALETTE);
}

export function persistPalette(palette: PaletteId): void {
  writeStored(PALETTE_STORAGE_KEY, palette);
}

export function applyPalette(
  palette: PaletteId,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.accent = palette;
}
