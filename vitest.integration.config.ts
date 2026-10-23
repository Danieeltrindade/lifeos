import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

/**
 * Testes de integração contra um projeto Supabase REAL (rede, Auth e RLS de verdade).
 * Não rodam em `npm test`. Configuração em docs/supabase-setup.md (seção "Testar o RLS
 * pela API"). Lê .env.local e .env.test.local (ambos fora do Git).
 */
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sequencial: as contas de teste são compartilhadas entre os casos.
    fileParallelism: false,
  },
}));
