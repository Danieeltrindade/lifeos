import { describe, expect, it } from 'vitest';
import { PALETTE_IDS } from './palettes';
import css from '@/styles/themes.css?raw';
import init from '/public/theme-init.js?raw';
import migrationBase from '/supabase/migrations/20261103120000_theme_color.sql?raw';
import migrationMono from '/supabase/migrations/20261103130000_theme_color_mono.sql?raw';

const migration = migrationMono;

/**
 * Confere o CSS GERADO (src/styles/themes.css), não o gerador: cada paleta tem os dois modos,
 * todos os tokens e contraste WCAG AA nos pares que a interface usa.
 */

type Vars = Record<string, string>;
function block(id: string, mode: 'light' | 'dark'): Vars {
  const re = new RegExp(`\\[data-theme='${mode}'\\] \\[data-accent='${id}'\\]\\s*\\{([^}]*)\\}`);
  const body = re.exec(css)?.[1];
  if (!body) throw new Error(`Bloco ausente: ${id}/${mode}`);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
  );
}

function rgb(color: string, over?: [number, number, number]): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex?.[1]) {
    const h = hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(color);
  if (m && over) {
    const a = Number(m[4]);
    return [1, 2, 3].map((i, k) => Number(m[i]) * a + (over[k] ?? 0) * (1 - a)) as [
      number,
      number,
      number,
    ];
  }
  throw new Error(`Cor não suportada no teste: ${color}`);
}
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const REQUIRED = [
  '--lo-bg',
  '--lo-sidebar',
  '--lo-surface',
  '--lo-surface-muted',
  '--lo-surface-raised',
  '--lo-border',
  '--lo-fg',
  '--lo-fg-muted',
  '--lo-fg-subtle',
  '--lo-primary',
  '--lo-primary-hover',
  '--lo-primary-fg',
  '--lo-primary-soft',
  '--lo-primary-soft-fg',
  '--lo-focus',
  '--lo-chart-primary',
  '--lo-glow',
  '--lo-hero',
];

describe('themes.css — 11 paletas × 2 modos', () => {
  for (const id of PALETTE_IDS) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${id} / ${mode === 'dark' ? 'escuro' : 'claro'}: tokens completos e contraste AA`, () => {
        const v = block(id, mode);
        for (const key of REQUIRED) expect(v[key], key).toBeTruthy();
        const surface = rgb(v['--lo-surface'] ?? '');
        const primary = rgb(v['--lo-primary'] ?? '');
        const ratio = (a: string, b: [number, number, number]) => contrast(rgb(a, b), b);
        expect(ratio(v['--lo-primary-fg'] ?? '', primary)).toBeGreaterThanOrEqual(4.5);
        for (const bg of ['--lo-bg', '--lo-sidebar', '--lo-surface', '--lo-surface-raised']) {
          const b = rgb(v[bg] ?? '');
          expect(ratio(v['--lo-primary'] ?? '', b), `primária sobre ${bg}`).toBeGreaterThanOrEqual(
            4.5,
          );
          expect(
            ratio(v['--lo-fg-subtle'] ?? '', b),
            `texto discreto sobre ${bg}`,
          ).toBeGreaterThanOrEqual(4.5);
          expect(ratio(v['--lo-fg'] ?? '', b), `texto sobre ${bg}`).toBeGreaterThanOrEqual(7);
        }
        const soft = rgb(v['--lo-primary-soft'] ?? '', surface);
        expect(contrast(rgb(v['--lo-primary-soft-fg'] ?? ''), soft)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(v['--lo-focus'] ?? '', surface), 'contorno de foco').toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('cada paleta tem uma primária própria em cada modo', () => {
    for (const mode of ['light', 'dark'] as const) {
      const primaries = PALETTE_IDS.map((id) => block(id, mode)['--lo-primary']);
      expect(new Set(primaries).size).toBe(PALETTE_IDS.length);
    }
  });

  it('a primeira migration já trazia as 10 paletas originais', () => {
    for (const id of PALETTE_IDS.filter((p) => p !== 'mono')) {
      expect(migrationBase).toContain(`'${id}'`);
    }
  });

  it('Mono é preto e branco: nenhuma cor de destaque, nos dois modos', () => {
    const saturation = (hex: string) => {
      const [r, g, b] = rgb(hex);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    for (const mode of ['light', 'dark'] as const) {
      const v = block('mono', mode);
      for (const key of [
        '--lo-primary',
        '--lo-primary-hover',
        '--lo-primary-soft',
        '--lo-primary-soft-fg',
        '--lo-focus',
        '--lo-chart-primary',
        '--lo-chart-1',
        '--lo-chart-2',
        '--lo-chart-3',
        '--lo-chart-4',
        '--lo-chart-5',
        '--lo-chart-6',
        '--lo-violet',
        '--lo-orange',
        '--lo-yellow',
        '--lo-info',
        '--lo-accent',
        '--lo-complete',
        '--lo-bg',
        '--lo-surface',
        '--lo-sidebar',
      ]) {
        expect(saturation(v[key] ?? ''), `${mode} ${key}`).toBe(0);
      }
      // Séries do gráfico distinguíveis por intensidade (todas diferentes).
      const series = [1, 2, 3, 4, 5, 6].map((i) => v[`--lo-chart-${String(i)}`]);
      expect(new Set(series).size).toBe(6);
    }
  });

  it('Ocean preserva a aparência original (mesmos valores de index.css)', () => {
    const dark = block('ocean', 'dark');
    const light = block('ocean', 'light');
    expect(dark['--lo-primary']).toBe('#2dd4bf');
    expect(dark['--lo-bg']).toBe('#0a1418');
    expect(dark['--lo-surface']).toBe('#0f1c21');
    expect(light['--lo-primary']).toBe('#0b7469');
    expect(light['--lo-bg']).toBe('#f3f6f6');
  });

  it('a mesma lista de paletas existe no script de inicialização e no banco', () => {
    for (const id of PALETTE_IDS) {
      expect(init).toContain(`'${id}'`);
      expect(migration).toContain(`'${id}'`);
    }
  });
});
