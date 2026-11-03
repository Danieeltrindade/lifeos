/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

/**
 * `vite preview` serve o build com os MESMOS cabeçalhos de segurança do deploy (vercel.json),
 * para que os testes ponta a ponta rodem sob a Content-Security-Policy de produção. Só o
 * connect-src ganha a origem do Supabase configurado (ex.: a pilha local http://localhost:54321).
 */
function productionHeaders(supabaseUrl: string | undefined): Record<string, string> {
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const out: Record<string, string> = {};
  for (const h of vercel.headers.find((x) => x.source === '/(.*)')?.headers ?? []) {
    out[h.key] = h.value;
  }
  const csp = out['Content-Security-Policy'];
  if (csp && supabaseUrl) {
    const origin = new URL(supabaseUrl).origin;
    out['Content-Security-Policy'] = csp.replace('connect-src ', `connect-src ${origin} `);
  }
  delete out['Strict-Transport-Security']; // o preview é HTTP local
  return out;
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: productionHeaders(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Bibliotecas em pacotes próprios: mudam pouco entre versões do app, então o navegador
        // reaproveita o cache depois de um novo deploy (o código do app muda; elas não).
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
            },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            {
              name: 'forms-query',
              test: /node_modules[\\/](zod|react-hook-form|@hookform|@tanstack)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // CSS desligado nos testes, exceto as paletas (lidas como texto por themes-css.test.ts).
    css: { include: [/themes\.css/] },
    restoreMocks: true,
    // Coerente com asyncUtilTimeout (src/tests/setup.ts): testes de fluxo fazem várias esperas.
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}'],
    // Integração com o Supabase real: `npm run test:integration`.
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
  },
}));
