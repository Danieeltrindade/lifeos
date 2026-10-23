import { z } from 'zod';
import { readStored, writeStored } from '@/lib/storage';

/**
 * Fonte de dados das telas de leitura.
 *
 *  - "supabase": padrão e ÚNICA opção em produção — dados reais do usuário autenticado.
 *  - "demo": dados fictícios para avaliar o design. Sempre sinalizados na interface.
 *  - "simulate-error" / "simulate-slow": inspecionar estados de erro e carregamento.
 *
 * Os três últimos são ferramentas de desenvolvimento: só existem quando o app roda com
 * `npm run dev` (import.meta.env.DEV). No build de produção, qualquer valor salvo é ignorado.
 */
export const DATA_SOURCE_STORAGE_KEY = 'lifeos:data-source';

export const dataSourceSchema = z.enum(['supabase', 'demo', 'simulate-error', 'simulate-slow']);
export type DataSourceMode = z.infer<typeof dataSourceSchema>;

export const DEFAULT_DATA_SOURCE: DataSourceMode = 'supabase';

export const DEV_TOOLS_ENABLED = import.meta.env.DEV;

export const DATA_SOURCE_LABELS: Record<DataSourceMode, { label: string; description: string }> = {
  supabase: {
    label: 'Seus dados (Supabase)',
    description: 'Dados reais da sua conta, protegidos por RLS no banco.',
  },
  demo: {
    label: 'Dados de demonstração',
    description: 'Exemplos fictícios, sinalizados, para avaliar o design. Nada é gravado.',
  },
  'simulate-error': {
    label: 'Simular erro',
    description: 'Força uma falha ao carregar, para inspecionar o estado de erro.',
  },
  'simulate-slow': {
    label: 'Simular lentidão',
    description: 'Atrasa o carregamento em 2,5 s, para inspecionar o estado de carregamento.',
  },
};

export function readDataSource(): DataSourceMode {
  if (!DEV_TOOLS_ENABLED) return DEFAULT_DATA_SOURCE;
  return readStored(DATA_SOURCE_STORAGE_KEY, dataSourceSchema, DEFAULT_DATA_SOURCE);
}

export function persistDataSource(mode: DataSourceMode): void {
  writeStored(DATA_SOURCE_STORAGE_KEY, mode);
}
