import { z } from 'zod';
import { readStored, writeStored } from '@/lib/storage';

/**
 * Fonte de dados enquanto o backend (Supabase) não está integrado.
 *
 *  - "none":  padrão. Não há backend; a interface mostra os estados vazios reais.
 *  - "demo":  dados fictícios para avaliar o design. Sempre sinalizados na interface.
 *  - "simulate-error" / "simulate-slow": utilitários para inspecionar estados de erro e carregamento.
 *
 * Na Fase 2 o modo "none" será substituído pelo repositório Supabase, e os demais
 * continuarão disponíveis apenas em desenvolvimento.
 */
export const DATA_SOURCE_STORAGE_KEY = 'lifeos:data-source';

export const dataSourceSchema = z.enum(['none', 'demo', 'simulate-error', 'simulate-slow']);
export type DataSourceMode = z.infer<typeof dataSourceSchema>;

export const DEFAULT_DATA_SOURCE: DataSourceMode = 'none';

export const DATA_SOURCE_LABELS: Record<DataSourceMode, { label: string; description: string }> = {
  none: {
    label: 'Sem backend (padrão)',
    description: 'Mostra a interface como ela é hoje: sem dados, até a integração com o Supabase.',
  },
  demo: {
    label: 'Dados de demonstração',
    description: 'Preenche o dashboard com exemplos fictícios, sinalizados, para avaliar o design.',
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
  return readStored(DATA_SOURCE_STORAGE_KEY, dataSourceSchema, DEFAULT_DATA_SOURCE);
}

export function persistDataSource(mode: DataSourceMode): void {
  writeStored(DATA_SOURCE_STORAGE_KEY, mode);
}
