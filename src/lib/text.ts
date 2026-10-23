/** Normaliza para busca: minúsculas e sem acentos ("Cálculo" encontra "calculo"). */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return fields.some((f) => f && normalizeForSearch(f).includes(q));
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
