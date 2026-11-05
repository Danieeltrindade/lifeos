/**
 * Regras puras das Notas (sem React nem Supabase): árvore de categorias, texto derivado do
 * documento do editor, imagens/vídeos referenciados, busca e prévia.
 */
import type { JSONContent } from '@tiptap/core';
import type { Tables } from '@/services/supabase/database.types';
import { matchesSearch } from '@/lib/text';

export type NoteCategory = Tables<'note_categories'>;
export type Note = Tables<'notes'>;

/** 24 cores para categorias (o usuário também pode escolher qualquer outra). */
export const NOTE_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'Vermelho', hex: '#e5484d' },
  { name: 'Coral', hex: '#f07a5a' },
  { name: 'Laranja', hex: '#f08c2e' },
  { name: 'Âmbar', hex: '#e5a50a' },
  { name: 'Amarelo', hex: '#d9c21a' },
  { name: 'Lima', hex: '#97c21e' },
  { name: 'Verde', hex: '#3fb950' },
  { name: 'Esmeralda', hex: '#199e70' },
  { name: 'Turquesa', hex: '#14b8a6' },
  { name: 'Ciano', hex: '#22b8cf' },
  { name: 'Céu', hex: '#38a3f1' },
  { name: 'Azul', hex: '#3b7ce5' },
  { name: 'Índigo', hex: '#5b62e6' },
  { name: 'Violeta', hex: '#7a5cff' },
  { name: 'Roxo', hex: '#a157e8' },
  { name: 'Magenta', hex: '#d14fd6' },
  { name: 'Rosa', hex: '#e5539a' },
  { name: 'Framboesa', hex: '#d63d6a' },
  { name: 'Marrom', hex: '#a0703c' },
  { name: 'Areia', hex: '#c2a477' },
  { name: 'Oliva', hex: '#8a8f3c' },
  { name: 'Ardósia', hex: '#6b7d8f' },
  { name: 'Cinza', hex: '#8f9aa3' },
  { name: 'Grafite', hex: '#4f5b66' },
];

export const DEFAULT_NOTE_COLOR = '#3b7ce5';

export function colorName(hex: string): string {
  return NOTE_COLORS.find((c) => c.hex === hex.toLowerCase())?.name ?? `Personalizada (${hex})`;
}

/** Normaliza uma cor digitada/escolhida para o formato aceito pelo banco (#rrggbb minúsculo). */
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

export interface CategoryNode {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  children: CategoryNode[];
}

const byOrder = (a: NoteCategory, b: NoteCategory) =>
  a.position - b.position || a.name.localeCompare(b.name, 'pt-BR');

/** Categorias (raiz) com as subcategorias dentro; ordem: posição, depois nome. */
export function buildCategoryTree(rows: readonly NoteCategory[]): CategoryNode[] {
  const toNode = (c: NoteCategory): CategoryNode => ({
    id: c.id,
    name: c.name,
    color: c.color,
    parentId: c.parent_id,
    children: rows
      .filter((x) => x.parent_id === c.id)
      .sort(byOrder)
      .map((x) => ({ id: x.id, name: x.name, color: c.color, parentId: c.id, children: [] })),
  });
  return rows
    .filter((c) => c.parent_id === null)
    .sort(byOrder)
    .map(toNode);
}

/** "Categoria" ou "Categoria › Subcategoria". Subcategorias herdam a cor da categoria. */
export function categoryLabel(
  id: string,
  rows: readonly NoteCategory[],
): { label: string; color: string; rootId: string | null } {
  const c = rows.find((x) => x.id === id);
  if (!c) return { label: 'Sem categoria', color: '#8f9aa3', rootId: null };
  if (!c.parent_id) return { label: c.name, color: c.color, rootId: c.id };
  const parent = rows.find((x) => x.id === c.parent_id);
  return {
    label: parent ? `${parent.name} › ${c.name}` : c.name,
    color: parent?.color ?? c.color,
    rootId: parent?.id ?? null,
  };
}

/** A categoria e todas as subcategorias dela (para filtrar ou contar). */
export function categoryAndChildren(id: string, rows: readonly NoteCategory[]): Set<string> {
  return new Set([id, ...rows.filter((c) => c.parent_id === id).map((c) => c.id)]);
}

// ---------------------------------------------------------------------------- documento

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [] };

function inlineText(node: JSONContent): string {
  if (node.type === 'text') {
    const text = node.text ?? '';
    const link = node.marks?.find((m) => m.type === 'link');
    const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : null;
    return href && href !== text ? `${text} (${href})` : text;
  }
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

function blockLines(node: JSONContent, indent: string): string[] {
  const children = node.content ?? [];
  switch (node.type) {
    case 'doc':
      return children.flatMap((c) => blockLines(c, indent));
    case 'paragraph':
    case 'heading':
      return [indent + inlineText(node)];
    case 'blockquote':
      return children.flatMap((c) => blockLines(c, indent)).map((l) => `> ${l}`);
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      return children.flatMap((item, i) => {
        const marker =
          node.type === 'bulletList'
            ? '• '
            : node.type === 'orderedList'
              ? `${String(start + i)}. `
              : item.attrs?.checked
                ? '☑ '
                : '☐ ';
        const [first, ...rest] = item.content ?? [];
        const head = first ? blockLines(first, '').join(' ') : '';
        return [indent + marker + head, ...rest.flatMap((c) => blockLines(c, `${indent}   `))];
      });
    }
    case 'horizontalRule':
      return [indent + '———'];
    case 'image':
      return [indent + '[imagem]'];
    case 'videoLink':
      return [indent + `[vídeo] ${String(node.attrs?.url ?? '')}`];
    case 'codeBlock':
      return [indent + inlineText(node)];
    default:
      return children.length ? children.flatMap((c) => blockLines(c, indent)) : [];
  }
}

/**
 * Texto puro do documento, com tópicos, numeração e caixas de seleção visíveis. É o que a
 * busca encontra, o que aparece na prévia do cartão e o que "Copiar" leva.
 */
export function docToText(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  return blockLines(doc, '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collect(doc: JSONContent | null | undefined, type: string, attr: string): string[] {
  const out: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === type) {
      const v: unknown = n.attrs?.[attr];
      if (typeof v === 'string' && v) out.push(v);
    }
    (n.content ?? []).forEach(walk);
  };
  if (doc) walk(doc);
  return out;
}

/** Caminhos no Storage das imagens que o documento usa. */
export function imagePaths(doc: JSONContent | null | undefined): string[] {
  return [...new Set(collect(doc, 'image', 'path'))];
}

export function videoLinks(doc: JSONContent | null | undefined): string[] {
  return collect(doc, 'videoLink', 'url');
}

/** Imagens que estavam no documento salvo e saíram da nova versão (para apagar do Storage). */
export function removedImages(
  before: JSONContent | null | undefined,
  after: JSONContent | null | undefined,
): string[] {
  const keep = new Set(imagePaths(after));
  return imagePaths(before).filter((p) => !keep.has(p));
}

export function isDoc(value: unknown): value is JSONContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'doc'
  );
}

// ---------------------------------------------------------------------------- vídeos

export type VideoProvider = 'youtube' | 'tiktok' | 'instagram' | 'vimeo' | 'other';

const PROVIDERS: { provider: VideoProvider; label: string; hosts: string[] }[] = [
  { provider: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  { provider: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
  { provider: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { provider: 'vimeo', label: 'Vimeo', hosts: ['vimeo.com'] },
];

/** Valida um link de vídeo (http/https) e identifica o site. Inválido → null. */
export function parseVideoUrl(
  raw: string,
): { url: string; provider: VideoProvider; label: string; host: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\.|^m\.|^vm\./, '');
  const known = PROVIDERS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return {
    url: url.toString(),
    provider: known?.provider ?? 'other',
    label: known?.label ?? 'Vídeo',
    host,
  };
}

// ---------------------------------------------------------------------------- lista

export function noteMatches(
  note: Note,
  query: string,
  categories: readonly NoteCategory[],
): boolean {
  if (!query.trim()) return true;
  return matchesSearch(
    query,
    note.title,
    note.content_text,
    categoryLabel(note.category_id, categories).label,
  );
}

/** Prévia do cartão: primeiras linhas do texto, sem quebrar no meio de uma palavra. */
export function noteExcerpt(text: string, maxLines = 7, maxChars = 320): string {
  const lines = text.replace(/\n{2,}/g, '\n').split('\n');
  let out = lines.slice(0, maxLines).join('\n');
  if (out.length > maxChars) out = `${out.slice(0, maxChars).replace(/\s+\S*$/, '')}…`;
  else if (lines.length > maxLines) out += '\n…';
  return out;
}

/** Fixadas primeiro; depois as editadas mais recentemente. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || Date.parse(b.updated_at) - Date.parse(a.updated_at),
  );
}
