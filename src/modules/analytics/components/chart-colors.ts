/** Paleta categórica em ordem fixa (tokens --lo-chart-*, validados para daltonismo). */
export const CHART_COLORS = [
  'var(--lo-chart-1)',
  'var(--lo-chart-2)',
  'var(--lo-chart-3)',
  'var(--lo-chart-4)',
  'var(--lo-chart-5)',
  'var(--lo-chart-6)',
];

/** Cor estável de uma entidade dado o índice dela na lista ORIGINAL (não no ranking). */
export function colorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? 'var(--lo-chart-1)';
}

/**
 * Série única que não representa uma entidade (ex.: "tempo por dia"): usa a cor da marca.
 * Entidades (matérias, categorias, hábitos) continuam com as cores categóricas fixas acima.
 */
export const SERIES_PRIMARY = 'var(--lo-chart-primary)';

/** Série de comparação (período anterior): neutra, atrás da série principal. */
export const SERIES_PREVIOUS = 'color-mix(in srgb, var(--lo-chart-axis) 45%, transparent)';
