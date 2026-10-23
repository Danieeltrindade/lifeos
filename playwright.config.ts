import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Testes ponta a ponta (npm run test:e2e) contra um Supabase de TESTE — nunca o projeto real.
 *
 * As variáveis vêm de .env.<E2E_MODE>.local (padrão: .env.stack.local, gerado por
 * `npm run stack:start`). Com `npx supabase start` (Docker), crie .env.e2e.local com a URL e a
 * chave publishable locais e rode com E2E_MODE=e2e. Ver docs/testing.md.
 */
const mode = process.env.E2E_MODE ?? 'stack';
const envFile = `.env.${mode}.local`;
const fileEnv: Record<string, string> = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1]) fileEnv[m[1]] = m[2] ?? '';
  }
}
for (const [k, v] of Object.entries(fileEnv)) process.env[k] ??= v;

const url = process.env.VITE_SUPABASE_URL ?? '';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  // Os testes criam e apagam contas e dados: só rodam contra um Supabase local.
  throw new Error(
    `test:e2e precisa de um Supabase LOCAL em ${envFile} (VITE_SUPABASE_URL=http://localhost:…). Recebido: "${url || 'vazio'}".`,
  );
}

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'test-results/e2e-report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    // Build de PRODUÇÃO (minificado) servido pelo preview do Vite — o mesmo pacote do deploy.
    command: `npx vite build --mode ${mode} --outDir dist-e2e && npx vite preview --mode ${mode} --outDir dist-e2e --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
