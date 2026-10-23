/**
 * Exportação de relatórios no navegador (CSV/JSON). Os dados vêm de leituras autenticadas
 * (RLS) — nada é enviado a terceiros; o arquivo é gerado localmente.
 */

type Cell = string | number | boolean | null | undefined;

/**
 * Célula CSV (RFC 4180): aspas quando há separador, aspas ou quebra de linha. Valores que
 * começam com = + − @ (ou tab/CR) recebem um apóstrofo para não virarem fórmula ao abrir
 * numa planilha (injeção de CSV).
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV com BOM (acentos corretos no Excel) e separador vírgula. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Lista de objetos → CSV, com a união das chaves como cabeçalho; objetos viram JSON. */
export function recordsToCsv(records: readonly Record<string, unknown>[]): string {
  const keys: string[] = [];
  for (const r of records) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return toCsv(
    keys,
    records.map((r) =>
      keys.map((k) => {
        const v = r[k];
        if (v === null || v === undefined) return null;
        if (typeof v === 'object') return JSON.stringify(v);
        return v as Cell;
      }),
    ),
  );
}

export function downloadFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
