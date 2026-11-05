import { describe, expect, it } from 'vitest';
import {
  buildCategoryTree,
  categoryAndChildren,
  categoryLabel,
  colorName,
  docToText,
  imagePaths,
  noteExcerpt,
  noteMatches,
  normalizeColor,
  NOTE_COLORS,
  parseVideoUrl,
  removedImages,
  sortNotes,
  videoLinks,
  type Note,
  type NoteCategory,
} from './notes';

const cat = (
  id: string,
  name: string,
  parent: string | null = null,
  position = 0,
): NoteCategory => ({
  id,
  user_id: 'u',
  parent_id: parent,
  name,
  color: parent ? '#000000' : '#e5484d',
  position,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  user_id: 'u',
  category_id: 'ideias',
  title: null,
  content: { type: 'doc', content: [] },
  content_text: '',
  pinned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('cores', () => {
  it('24 cores distintas e válidas', () => {
    expect(NOTE_COLORS).toHaveLength(24);
    expect(new Set(NOTE_COLORS.map((c) => c.hex)).size).toBe(24);
    for (const c of NOTE_COLORS) expect(normalizeColor(c.hex)).toBe(c.hex);
  });
  it('normaliza e nomeia', () => {
    expect(normalizeColor(' #ABCDEF ')).toBe('#abcdef');
    expect(normalizeColor('red')).toBeNull();
    expect(colorName('#E5484D')).toBe('Vermelho');
    expect(colorName('#123456')).toBe('Personalizada (#123456)');
  });
});

describe('categorias', () => {
  const rows = [
    cat('frases', 'Frases', null, 1),
    cat('ideias', 'Ideias', null, 0),
    cat('app', 'Apps', 'ideias', 1),
    cat('neg', 'Negócios', 'ideias', 0),
  ];
  it('monta a árvore em ordem, subcategorias herdam a cor', () => {
    const tree = buildCategoryTree(rows);
    expect(tree.map((n) => n.name)).toEqual(['Ideias', 'Frases']);
    expect(tree[0]?.children.map((n) => n.name)).toEqual(['Negócios', 'Apps']);
    expect(tree[0]?.children[0]?.color).toBe('#e5484d');
  });
  it('rótulo com caminho', () => {
    expect(categoryLabel('app', rows)).toEqual({
      label: 'Ideias › Apps',
      color: '#e5484d',
      rootId: 'ideias',
    });
    expect(categoryLabel('frases', rows).label).toBe('Frases');
    expect(categoryLabel('x', rows).label).toBe('Sem categoria');
  });
  it('categoria inclui as subcategorias', () => {
    expect([...categoryAndChildren('ideias', rows)].sort()).toEqual(['app', 'ideias', 'neg']);
    expect([...categoryAndChildren('app', rows)]).toEqual(['app']);
  });
});

describe('documento → texto', () => {
  it('mantém tópicos, numeração, caixas, citações e links', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                p('um'),
                { type: 'bulletList', content: [{ type: 'listItem', content: [p('dentro')] }] },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [p('três')] }],
        },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: true }, content: [p('feito')] },
            { type: 'taskItem', attrs: { checked: false }, content: [p('falta')] },
          ],
        },
        { type: 'blockquote', content: [p('citação')] },
        { type: 'horizontalRule' },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'site',
              marks: [{ type: 'link', attrs: { href: 'https://a.com' } }],
            },
          ],
        },
        { type: 'image', attrs: { path: 'u/1.webp' } },
        { type: 'videoLink', attrs: { url: 'https://youtu.be/x' } },
      ],
    };
    expect(docToText(doc)).toBe(
      [
        'Título',
        '• um',
        '   • dentro',
        '3. três',
        '☑ feito',
        '☐ falta',
        '> citação',
        '———',
        'site (https://a.com)',
        '[imagem]',
        '[vídeo] https://youtu.be/x',
      ].join('\n'),
    );
  });
  it('vazio', () => {
    expect(docToText(null)).toBe('');
    expect(docToText({ type: 'doc', content: [] })).toBe('');
  });
});

describe('imagens e vídeos', () => {
  const before = {
    type: 'doc',
    content: [
      { type: 'image', attrs: { path: 'u/a.webp' } },
      { type: 'image', attrs: { path: 'u/b.webp' } },
      { type: 'videoLink', attrs: { url: 'https://tiktok.com/@x/video/1' } },
    ],
  };
  const after = { type: 'doc', content: [{ type: 'image', attrs: { path: 'u/b.webp' } }] };
  it('lista e detecta removidas', () => {
    expect(imagePaths(before)).toEqual(['u/a.webp', 'u/b.webp']);
    expect(videoLinks(before)).toHaveLength(1);
    expect(removedImages(before, after)).toEqual(['u/a.webp']);
  });
  it('reconhece sites de vídeo e recusa links inválidos', () => {
    expect(parseVideoUrl('https://www.tiktok.com/@a/video/1')?.provider).toBe('tiktok');
    expect(parseVideoUrl('https://youtu.be/abc')?.label).toBe('YouTube');
    expect(parseVideoUrl('https://m.youtube.com/watch?v=1')?.provider).toBe('youtube');
    expect(parseVideoUrl('https://exemplo.com/v.mp4')?.provider).toBe('other');
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull();
    expect(parseVideoUrl('não é link')).toBeNull();
  });
});

describe('lista', () => {
  const rows = [cat('ideias', 'Ideias')];
  it('busca no título, texto e categoria sem acento', () => {
    const n = note('1', { title: 'Viagem', content_text: 'Ir a São Paulo' });
    expect(noteMatches(n, 'sao paulo', rows)).toBe(true);
    expect(noteMatches(n, 'ideias', rows)).toBe(true);
    expect(noteMatches(n, 'praia', rows)).toBe(false);
  });
  it('fixadas primeiro, depois as mais recentes', () => {
    const list = sortNotes([
      note('a', { updated_at: '2026-01-03T00:00:00Z' }),
      note('b', { updated_at: '2026-01-01T00:00:00Z', pinned: true }),
      note('c', { updated_at: '2026-01-05T00:00:00Z' }),
    ]);
    expect(list.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });
  it('prévia corta linhas e caracteres', () => {
    expect(noteExcerpt('a\n\nb\nc', 2)).toBe('a\nb\n…');
    const long = 'palavra '.repeat(80);
    const out = noteExcerpt(long, 7, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
  });
});
