import type { LifeosClient } from '@/services/supabase/client';
import type { Json } from '@/services/supabase/database.types';
import { removeAllNoteImages } from '@/modules/notes/data/notes-api';
import { toAppError } from '@/services/supabase/errors';

/** Portabilidade (LGPD art. 18, V): todos os dados do usuário em JSON. */
export async function exportMyData(client: LifeosClient): Promise<Json> {
  const { data, error } = await client.rpc('export_my_data');
  if (error) throw toAppError(error);
  return data;
}

/**
 * Exclui a conta e, em cascata, todos os dados. A função do banco só age sobre o
 * usuário do JWT — não recebe ID. A interface exige reautenticação antes de chamar.
 */
export async function deleteMyAccount(client: LifeosClient): Promise<void> {
  // Imagens das notas ficam no Storage (fora da cascata do banco): apagadas antes.
  await removeAllNoteImages(client);
  const { error } = await client.rpc('delete_my_account');
  if (error) throw toAppError(error);
}

export function exportFileName(now: Date): string {
  return `lifeos-dados-${now.toISOString().slice(0, 10)}.json`;
}

/** Tabelas oferecidas em CSV (chaves do JSON de export_my_data). */
export const CSV_TABLES: { key: string; label: string }[] = [
  { key: 'tasks', label: 'Tarefas' },
  { key: 'projects', label: 'Projetos' },
  { key: 'activities', label: 'Atividades (tempo registrado)' },
  { key: 'focusSessions', label: 'Sessões de foco' },
  { key: 'sessionReflections', label: 'Reflexões das sessões' },
  { key: 'reviewAttempts', label: 'Revisões feitas' },
  { key: 'habitCheckins', label: 'Marcações de hábitos' },
  { key: 'goals', label: 'Metas' },
  { key: 'goalProgressEntries', label: 'Lançamentos de metas' },
  { key: 'calendarEvents', label: 'Eventos do calendário' },
  { key: 'recommendations', label: 'Recomendações (histórico)' },
  { key: 'weeklyReviews', label: 'Revisões semanais' },
  { key: 'notes', label: 'Notas' },
];

/** Linhas de uma tabela do JSON exportado (lista vazia se a chave não existir). */
export function exportTableRecords(data: Json, key: string): Record<string, unknown>[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    : [];
}
