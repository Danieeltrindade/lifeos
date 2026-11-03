// Gera src/styles/themes.css — as 10 paletas de cores do LifeOS, cada uma em modo claro e escuro.
//
// Uso: npm run themes   (o CSS gerado é versionado; rode de novo só ao mudar as paletas aqui)
//
// Princípios:
//  * Ocean é a aparência original: seus valores são copiados literalmente, não derivados.
//  * Os demais temas mantêm a MESMA estrutura de camadas do Ocean (barra lateral < fundo <
//    cartão < superfície interna < elevada, mesmas luminosidades), mas os neutros são puxados
//    para a matiz do tema — assim cada tema tem identidade própria, não só um botão diferente.
//  * Cores semânticas (sucesso, atenção, erro, informação), destaques secundários e a paleta
//    categórica dos gráficos NÃO mudam: elas comunicam significado, não marca.
//  * Os blocos valem tanto no <html> quanto em qualquer elemento com data-accent (as prévias
//    dos cards de tema usam isso para mostrar cada paleta com as cores reais).
//  * Contraste WCAG AA conferido aqui (o script falha se algum par ficar abaixo do mínimo) e
//    de novo em src/lib/theme/themes-css.test.ts, lendo o CSS gerado.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- cor
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) =>
  '#' +
  c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
function rgb2hsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb([h, s, l]) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
    p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
const rgbList = (h) => hex2rgb(h).join(' ');
/** Neutro do Ocean levado para outra matiz, preservando a luminosidade. */
function retint(h, hue, satFactor) {
  const [, s, l] = rgb2hsl(hex2rgb(h));
  return rgb2hex(hsl2rgb([hue, Math.min(1, s * satFactor), l]));
}
function luminance(h) {
  return hex2rgb(h)
    .map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Cor com transparência composta sobre um fundo (para medir contraste de fundos suaves). */
const over = (h, alpha, bg) => mix(bg, h, alpha);
/** Escurece/clareia até atingir o contraste pedido sobre um fundo. */
function ensure(fg, bg, min, towards) {
  let c = fg;
  for (let i = 0; i < 40 && contrast(c, bg) < min; i++) c = mix(c, towards, 0.06);
  return c;
}

// ---------------------------------------------------------------- Ocean (original)
const OCEAN = {
  dark: {
    bg: '#0a1418',
    sidebar: '#071013',
    surface: '#0f1c21',
    muted: '#13252b',
    raised: '#182d34',
    border: '#1f363d',
    borderStrong: '#2c4951',
    fg: '#e7f0f1',
    fgMuted: '#b2c5c9',
    fgSubtle: '#87a1a7',
    fgDisabled: '#4f676d',
    hero: ['#10262c', '#0c1c21', '#0e2a2f'],
  },
  light: {
    bg: '#f3f6f6',
    sidebar: '#ebf0f0',
    surface: '#ffffff',
    muted: '#eef3f3',
    raised: '#ffffff',
    border: '#dce5e5',
    borderStrong: '#c3d1d1',
    fg: '#0f1f23',
    fgMuted: '#44585c',
    fgSubtle: '#55696d',
    fgDisabled: '#9aabad',
    progress: '#e3eaea',
    heroEnd: '#f0f8f7',
  },
};

// ---------------------------------------------------------------- os 11 temas
// hue = matiz dos neutros; sat = intensidade da tinta nos neutros (cores quentes pedem menos).
export const THEMES = [
  { id: 'ocean', dark: '#2dd4bf', light: '#0b7469', hue: 192, sat: 1 },
  { id: 'nebula', dark: '#a78bfa', light: '#6a4fd0', hue: 262, sat: 0.85 },
  { id: 'forest', dark: '#4ade80', light: '#16834a', hue: 152, sat: 0.8 },
  { id: 'ember', dark: '#fb923c', light: '#c45b1c', hue: 24, sat: 0.55 },
  { id: 'midnight', dark: '#60a5fa', light: '#2563eb', hue: 218, sat: 1 },
  { id: 'rose', dark: '#f472b6', light: '#c43b83', hue: 328, sat: 0.6 },
  { id: 'crimson', dark: '#fb7185', light: '#c8324d', hue: 350, sat: 0.55 },
  { id: 'amethyst', dark: '#818cf8', light: '#5148c7', hue: 238, sat: 0.9 },
  { id: 'gold', dark: '#facc15', light: '#947000', hue: 44, sat: 0.5 },
  { id: 'arctic', dark: '#38bdf8', light: '#087da9', hue: 200, sat: 0.95 },
  // Mono não é derivado do Ocean: preto, grafite e branco definidos à mão (buildMono).
  { id: 'mono', dark: '#ffffff', light: '#111111', mono: true },
];

const chevron = (h) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23${h.slice(1)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

const failures = [];
function check(label, fg, bg, min) {
  const c = contrast(fg, bg);
  if (c < min) failures.push(`${label}: ${c.toFixed(2)} < ${min}`);
}

function build(t) {
  const isOcean = t.id === 'ocean';
  const n = (h) => (isOcean ? h : retint(h, t.hue, t.sat));
  const D = Object.fromEntries(
    Object.entries(OCEAN.dark).map(([k, v]) => [k, Array.isArray(v) ? v.map(n) : n(v)]),
  );
  const L = Object.fromEntries(Object.entries(OCEAN.light).map(([k, v]) => [k, n(v)]));
  // Brancos continuam brancos (cartões do claro), sem tinta.
  L.surface = '#ffffff';
  L.raised = '#ffffff';

  // --- escuro
  const P = t.dark;
  const hover = isOcean ? '#5ee6cf' : mix(P, '#ffffff', 0.28);
  const softFg = isOcean ? '#99f0e1' : mix(P, '#ffffff', 0.5);
  const [ph] = rgb2hsl(hex2rgb(P));
  const onPrimary = isOcean
    ? '#032420'
    : ensure(rgb2hex(hsl2rgb([ph, 0.75, 0.08])), P, 7, '#000000');
  const mid = isOcean ? '#0f8f82' : mix(t.dark, t.light, 0.55);
  const glowRgb = rgbList(P);
  const second = isOcean ? '34 140 160' : rgbList(rgb2hex(hsl2rgb([ph - 18, 0.55, 0.42])));

  // --- claro
  // A referência do claro é escurecida só o necessário para texto/links passarem de 4,5:1 sobre
  // o fundo da página e da barra lateral (ex.: Ember, Gold e Arctic).
  const LP = isOcean ? t.light : ensure(t.light, L.sidebar, 4.6, '#000000');
  const lHover = isOcean ? '#0a5f57' : mix(LP, '#000000', 0.18);
  const lOnPrimary =
    contrast('#ffffff', LP) >= 4.5
      ? '#ffffff'
      : ensure(mix(LP, '#000000', 0.8), LP, 4.5, '#000000');
  const lSoft = isOcean ? '#e0f3f0' : mix(LP, '#ffffff', 0.89);
  const lSoftFg = isOcean ? '#08564e' : ensure(mix(LP, '#000000', 0.28), lSoft, 7, '#000000');
  const lMid = isOcean ? '#0f8f82' : mix(LP, P, 0.3);

  // --- contraste (WCAG AA: 4,5 texto; 3 componentes/foco)
  const id = t.id;
  for (const [mode, S, pri, onP, sFg, soft] of [
    ['escuro', D, P, onPrimary, softFg, over(P, 0.12, D.surface)],
    ['claro', L, LP, lOnPrimary, lSoftFg, lSoft],
  ]) {
    check(`${id}/${mode} texto sobre primária`, onP, pri, 4.5);
    check(`${id}/${mode} primária sobre cartão`, pri, S.surface, mode === 'escuro' ? 4.5 : 4.5);
    check(`${id}/${mode} primária sobre fundo`, pri, S.bg, 4.5);
    check(`${id}/${mode} primária sobre barra lateral`, pri, S.sidebar, 4.5);
    check(`${id}/${mode} texto do fundo suave`, sFg, soft, 4.5);
    for (const k of ['bg', 'sidebar', 'surface', 'muted', 'raised']) {
      check(`${id}/${mode} texto discreto sobre ${k}`, S.fgSubtle, S[k], 4.5);
      check(`${id}/${mode} texto sobre ${k}`, S.fg, S[k], 7);
    }
  }
  check(`${id}/escuro foco`, hover, D.surface, 3);
  check(`${id}/claro foco`, lMid, L.surface, 3);

  const dark = {
    '--lo-bg': D.bg,
    '--lo-sidebar': D.sidebar,
    '--lo-surface': D.surface,
    '--lo-surface-muted': D.muted,
    '--lo-surface-raised': D.raised,
    '--lo-border': D.border,
    '--lo-border-strong': D.borderStrong,
    '--lo-fg': D.fg,
    '--lo-fg-muted': D.fgMuted,
    '--lo-fg-subtle': D.fgSubtle,
    '--lo-fg-disabled': D.fgDisabled,
    '--lo-primary': P,
    '--lo-primary-hover': hover,
    '--lo-primary-fg': onPrimary,
    '--lo-primary-soft': `rgb(${glowRgb} / 0.12)`,
    '--lo-primary-soft-fg': softFg,
    '--lo-progress-track': `rgb(${rgbList(D.fgSubtle)} / 0.16)`,
    '--lo-danger-fg': D.bg,
    '--lo-focus': hover,
    '--lo-select-chevron': chevron(D.fgSubtle),
    '--lo-chart-primary': P,
    '--lo-chart-grid': D.border,
    '--lo-chart-axis': D.fgSubtle,
    '--lo-glow': `0 0 0 1px rgb(${glowRgb} / 0.35), 0 8px 24px -8px rgb(${glowRgb} / 0.55)`,
    '--lo-app-bg': `radial-gradient(1100px 560px at 100% -10%, rgb(${glowRgb} / 0.07), transparent 62%), radial-gradient(900px 520px at -10% 110%, rgb(${second} / 0.06), transparent 60%)`,
    '--lo-hero': `radial-gradient(90% 130% at 100% 0%, rgb(${glowRgb} / 0.2), transparent 55%), linear-gradient(135deg, ${D.hero[0]} 0%, ${D.hero[1]} 48%, ${D.hero[2]} 100%)`,
    '--lo-hero-ridge-1': `rgb(${glowRgb} / 0.07)`,
    '--lo-hero-ridge-2': `rgb(${glowRgb} / 0.11)`,
    '--lo-hero-ridge-3': `rgb(${rgbList(D.sidebar)} / 0.75)`,
    '--hero-glow': `radial-gradient(80% 120% at 0% 0%, rgb(${glowRgb} / 0.07), transparent 60%)`,
    '--lo-brand-from': hover,
    '--lo-brand-to': mid,
    '--lo-brand-ink': onPrimary,
    '--lo-brand-shadow': `rgb(${glowRgb} / 0.35)`,
  };
  const lightMidRgb = rgbList(lMid);
  const light = {
    '--lo-bg': L.bg,
    '--lo-sidebar': L.sidebar,
    '--lo-surface': L.surface,
    '--lo-surface-muted': L.muted,
    '--lo-surface-raised': L.raised,
    '--lo-border': L.border,
    '--lo-border-strong': L.borderStrong,
    '--lo-fg': L.fg,
    '--lo-fg-muted': L.fgMuted,
    '--lo-fg-subtle': L.fgSubtle,
    '--lo-fg-disabled': L.fgDisabled,
    '--lo-primary': LP,
    '--lo-primary-hover': lHover,
    '--lo-primary-fg': lOnPrimary,
    '--lo-primary-soft': lSoft,
    '--lo-primary-soft-fg': lSoftFg,
    '--lo-progress-track': L.progress,
    '--lo-focus': lMid,
    '--lo-select-chevron': chevron(L.fgSubtle),
    '--lo-chart-primary': lMid,
    '--lo-chart-grid': L.progress,
    '--lo-chart-axis': L.fgSubtle,
    '--lo-glow': `0 6px 18px -6px rgb(${rgbList(LP)} / 0.45)`,
    '--lo-app-bg': `radial-gradient(1100px 520px at 100% -8%, rgb(${lightMidRgb} / 0.07), transparent 65%)`,
    '--lo-hero': `radial-gradient(120% 140% at 100% 0%, rgb(${lightMidRgb} / 0.14), transparent 55%), linear-gradient(135deg, #ffffff 0%, ${L.heroEnd} 100%)`,
    '--lo-hero-ridge-1': `rgb(${lightMidRgb} / 0.1)`,
    '--lo-hero-ridge-2': `rgb(${lightMidRgb} / 0.16)`,
    '--lo-hero-ridge-3': `rgb(${lightMidRgb} / 0.24)`,
    '--hero-glow': `radial-gradient(80% 120% at 0% 0%, rgb(${lightMidRgb} / 0.06), transparent 60%)`,
    '--lo-brand-from': hover,
    '--lo-brand-to': mid,
    '--lo-brand-ink': onPrimary,
    '--lo-brand-shadow': `rgb(${rgbList(LP)} / 0.3)`,
  };
  return { dark, light };
}

/**
 * Mono — preto e branco de verdade, não um Ocean dessaturado. Diferente das demais paletas,
 * ele também neutraliza o que é cor decorativa: destaques secundários dos indicadores,
 * "informação", a paleta categórica dos gráficos (vira intensidades de cinza) e o
 * "concluído" de hábitos e metas (vira o próprio branco/preto). Sucesso, atenção e erro
 * continuam coloridos, mas só aparecem em estados que pedem atenção.
 */
function buildMono() {
  const D = {
    sidebar: '#050505',
    bg: '#000000',
    surface: '#0c0c0c',
    muted: '#141414',
    raised: '#1b1b1b',
    border: '#292929',
    borderStrong: '#3a3a3a',
    fg: '#ffffff',
    fgMuted: '#c4c4c4',
    fgSubtle: '#8a8a8a',
    fgDisabled: '#555555',
  };
  const L = {
    sidebar: '#f0f0f0',
    bg: '#f7f7f7',
    surface: '#ffffff',
    muted: '#f5f5f5',
    raised: '#ffffff',
    border: '#e2e2e2',
    borderStrong: '#cccccc',
    fg: '#111111',
    fgMuted: '#444444',
    fgSubtle: '#777777',
    fgDisabled: '#aaaaaa',
  };
  // A referência #777777 fica abaixo de 4,5:1 sobre a barra lateral clara: escurece o mínimo.
  L.fgSubtle = ensure(L.fgSubtle, L.sidebar, 4.6, '#000000');
  D.fgSubtle = ensure(D.fgSubtle, D.raised, 4.6, '#ffffff');

  for (const [mode, S, pri, onP, sFg, soft] of [
    ['escuro', D, '#ffffff', '#000000', '#ffffff', '#202020'],
    ['claro', L, '#111111', '#ffffff', '#222222', '#ededed'],
  ]) {
    check(`mono/${mode} texto sobre primária`, onP, pri, 4.5);
    check(`mono/${mode} texto do fundo suave`, sFg, soft, 4.5);
    for (const k of ['bg', 'sidebar', 'surface', 'muted', 'raised']) {
      check(`mono/${mode} primária sobre ${k}`, pri, S[k], 4.5);
      check(`mono/${mode} texto discreto sobre ${k}`, S.fgSubtle, S[k], 4.5);
      check(`mono/${mode} texto sobre ${k}`, S.fg, S[k], 7);
    }
  }

  const base = (S) => ({
    '--lo-bg': S.bg,
    '--lo-sidebar': S.sidebar,
    '--lo-surface': S.surface,
    '--lo-surface-muted': S.muted,
    '--lo-surface-raised': S.raised,
    '--lo-border': S.border,
    '--lo-border-strong': S.borderStrong,
    '--lo-fg': S.fg,
    '--lo-fg-muted': S.fgMuted,
    '--lo-fg-subtle': S.fgSubtle,
    '--lo-fg-disabled': S.fgDisabled,
  });
  const dark = {
    ...base(D),
    '--lo-primary': '#ffffff',
    '--lo-primary-hover': '#e5e5e5',
    '--lo-primary-fg': '#000000',
    '--lo-primary-soft': '#202020',
    '--lo-primary-soft-fg': '#ffffff',
    '--lo-progress-track': 'rgb(255 255 255 / 0.1)',
    '--lo-danger-fg': D.bg,
    '--lo-focus': '#ffffff',
    '--lo-select-chevron': chevron(D.fgSubtle),
    '--lo-complete': '#ffffff',
    '--lo-complete-soft': 'rgb(255 255 255 / 0.08)',
    '--lo-accent': '#d4d4d4',
    '--lo-accent-soft': 'rgb(255 255 255 / 0.07)',
    '--lo-accent-soft-fg': '#e5e5e5',
    '--lo-info': '#d4d4d4',
    '--lo-info-soft': 'rgb(255 255 255 / 0.07)',
    '--lo-violet': '#e5e5e5',
    '--lo-violet-soft': 'rgb(255 255 255 / 0.07)',
    '--lo-orange': '#e5e5e5',
    '--lo-orange-soft': 'rgb(255 255 255 / 0.07)',
    '--lo-yellow': '#e5e5e5',
    '--lo-yellow-soft': 'rgb(255 255 255 / 0.07)',
    '--lo-chart-1': '#ffffff',
    '--lo-chart-2': '#a3a3a3',
    '--lo-chart-3': '#6b6b6b',
    '--lo-chart-4': '#d4d4d4',
    '--lo-chart-5': '#858585',
    '--lo-chart-6': '#525252',
    '--lo-chart-primary': '#ffffff',
    '--lo-chart-grid': D.border,
    '--lo-chart-axis': D.fgSubtle,
    '--lo-glow': '0 0 0 1px rgb(255 255 255 / 0.18), 0 8px 24px -10px rgb(255 255 255 / 0.25)',
    '--lo-app-bg': 'none',
    '--lo-card-sheen': 'linear-gradient(180deg, rgb(255 255 255 / 0.03), rgb(255 255 255 / 0) 55%)',
    '--lo-hero':
      'radial-gradient(90% 130% at 100% 0%, rgb(255 255 255 / 0.07), transparent 55%), linear-gradient(135deg, #121212 0%, #0a0a0a 50%, #0f0f0f 100%)',
    '--lo-hero-ridge-1': 'rgb(255 255 255 / 0.035)',
    '--lo-hero-ridge-2': 'rgb(255 255 255 / 0.06)',
    '--lo-hero-ridge-3': 'rgb(5 5 5 / 0.8)',
    '--hero-glow': 'none',
    '--lo-brand-from': '#ffffff',
    '--lo-brand-to': '#cfcfcf',
    '--lo-brand-ink': '#000000',
    '--lo-brand-shadow': 'rgb(255 255 255 / 0.15)',
  };
  const light = {
    ...base(L),
    '--lo-primary': '#111111',
    '--lo-primary-hover': '#333333',
    '--lo-primary-fg': '#ffffff',
    '--lo-primary-soft': '#ededed',
    '--lo-primary-soft-fg': '#222222',
    '--lo-progress-track': '#e9e9e9',
    '--lo-focus': '#333333',
    '--lo-select-chevron': chevron(L.fgSubtle),
    '--lo-complete': '#111111',
    '--lo-complete-soft': '#ededed',
    '--lo-accent': '#3d3d3d',
    '--lo-accent-soft': '#f0f0f0',
    '--lo-accent-soft-fg': '#333333',
    '--lo-info': '#3d3d3d',
    '--lo-info-soft': '#f0f0f0',
    '--lo-violet': '#333333',
    '--lo-violet-soft': '#f0f0f0',
    '--lo-orange': '#333333',
    '--lo-orange-soft': '#f0f0f0',
    '--lo-yellow': '#333333',
    '--lo-yellow-soft': '#f0f0f0',
    '--lo-chart-1': '#111111',
    '--lo-chart-2': '#6b6b6b',
    '--lo-chart-3': '#a3a3a3',
    '--lo-chart-4': '#3d3d3d',
    '--lo-chart-5': '#8a8a8a',
    '--lo-chart-6': '#c4c4c4',
    '--lo-chart-primary': '#111111',
    '--lo-chart-grid': '#e9e9e9',
    '--lo-chart-axis': L.fgSubtle,
    '--lo-glow': '0 6px 16px -8px rgb(0 0 0 / 0.35)',
    '--lo-app-bg': 'none',
    '--lo-card-sheen': 'none',
    '--lo-hero':
      'radial-gradient(120% 140% at 100% 0%, rgb(0 0 0 / 0.05), transparent 55%), linear-gradient(135deg, #ffffff 0%, #f1f1f1 100%)',
    '--lo-hero-ridge-1': 'rgb(0 0 0 / 0.035)',
    '--lo-hero-ridge-2': 'rgb(0 0 0 / 0.06)',
    '--lo-hero-ridge-3': 'rgb(0 0 0 / 0.09)',
    '--hero-glow': 'none',
    '--lo-brand-from': '#3a3a3a',
    '--lo-brand-to': '#000000',
    '--lo-brand-ink': '#ffffff',
    '--lo-brand-shadow': 'rgb(0 0 0 / 0.2)',
  };
  return { dark, light };
}

const block = (sel, vars) =>
  `${sel} {\n${Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')}\n}\n`;

let css = `/*
 * GERADO por scripts/generate-themes.mjs — não edite à mão (rode \`npm run themes\`).
 *
 * 11 paletas × 2 modos. A paleta vem de data-accent e o modo de data-theme, ambos no <html>;
 * os dois são independentes. Os mesmos blocos valem para um elemento com data-accent dentro
 * da página (prévias dos cards de tema). Cores semânticas, destaques secundários e a paleta
 * categórica dos gráficos ficam em index.css e não mudam com a paleta — exceto no Mono, que
 * troca os decorativos por cinzas (ver buildMono).
 */
`;
for (const t of THEMES) {
  const { dark, light } = t.mono ? buildMono() : build(t);
  css += `\n/* ---------- ${t.id} ---------- */\n`;
  css += block(
    `:root[data-accent='${t.id}'],\n[data-theme='light'][data-accent='${t.id}'],\n[data-theme='light'] [data-accent='${t.id}']`,
    light,
  );
  css += block(
    `[data-theme='dark'][data-accent='${t.id}'],\n[data-theme='dark'] [data-accent='${t.id}']`,
    dark,
  );
}

if (failures.length) {
  console.error('Contraste insuficiente:\n' + failures.join('\n'));
  process.exit(1);
}
const out = fileURLToPath(new URL('../src/styles/themes.css', import.meta.url));
writeFileSync(out, css);
console.log(`themes.css gerado: ${THEMES.length} temas × 2 modos, contrastes AA conferidos.`);
