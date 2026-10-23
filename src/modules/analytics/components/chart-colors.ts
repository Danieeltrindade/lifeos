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
