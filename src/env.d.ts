/// <reference types="vite/client" />

/**
 * Variáveis públicas (vão para o bundle). Apenas valores que podem ser vistos por
 * qualquer visitante: a URL do projeto e a chave publishable/anon. Segredos nunca
 * usam o prefixo VITE_.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
