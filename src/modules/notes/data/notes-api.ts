/**
 * Leituras e escritas das Notas. Mesmo padrão do resto do LifeOS: listas inteiras lidas por
 * página (fetchAll), escritas por useLifeosMutation (invalida o domínio "notes"), RLS no banco.
 *
 * Imagens: bucket PRIVADO 'note-images', na pasta da conta (<user_id>/<uuid>.webp). A página
 * baixa o arquivo pela API autenticada e mostra por URL "blob:" local — nenhuma URL pública
 * ou assinada é exposta e a política de segurança do site (CSP) não precisa abrir exceções.
 */
import { useQuery } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { useLifeosMutation } from '@/lib/query/mutations';
import type { LifeosClient } from '@/services/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/services/supabase/database.types';
import { AppError, toAppError } from '@/services/supabase/errors';
import { fetchAll, must, mustSucceed } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import { docToText, imagePaths, removedImages, type Note, type NoteCategory } from '../logic/notes';

export const NOTE_IMAGES_BUCKET = 'note-images';

export const notesKeys = {
  categories: ['notes', 'categories'] as const,
  list: ['notes', 'list'] as const,
};

export function useNoteCategoriesQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: notesKeys.categories,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('note_categories')
          .select('*')
          .order('position', { ascending: true })
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

export function useNotesQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: notesKeys.list,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('notes')
          .select('*')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

// ---------------------------------------------------------------------------- categorias

export interface CategoryDraft {
  id?: string;
  name: string;
  color: string;
  /** Subcategorias: existentes (com id) mantidas/renomeadas, novas (sem id) criadas. */
  subcategories: { id?: string; name: string }[];
  /** Subcategorias existentes removidas no formulário (precisam estar sem notas). */
  removedSubIds: string[];
}

export function useSaveCategory() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['notes'],
    silentError: true,
    success: (_d, v: CategoryDraft) => (v.id ? 'Categoria atualizada.' : 'Categoria criada.'),
    mutationFn: async (draft: CategoryDraft) => {
      const root: NoteCategory = draft.id
        ? await must(
            client
              .from('note_categories')
              .update({ name: draft.name, color: draft.color })
              .eq('id', draft.id)
              .select('*')
              .single(),
          )
        : await must(
            client
              .from('note_categories')
              .insert({ name: draft.name, color: draft.color })
              .select('*')
              .single(),
          );
      for (const id of draft.removedSubIds) {
        await mustSucceed(client.from('note_categories').delete().eq('id', id));
      }
      for (const [position, sub] of draft.subcategories.entries()) {
        if (sub.id) {
          await mustSucceed(
            client.from('note_categories').update({ name: sub.name, position }).eq('id', sub.id),
          );
        } else {
          await mustSucceed(
            client
              .from('note_categories')
              .insert({ name: sub.name, parent_id: root.id, color: draft.color, position }),
          );
        }
      }
      return root;
    },
  });
}

/**
 * Exclui uma categoria (e as subcategorias dela). Se houver notas, elas são movidas antes
 * para `moveTo` — o banco recusa excluir uma categoria com notas (ON DELETE RESTRICT).
 */
export function useDeleteCategory() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['notes'],
    success: 'Categoria excluída.',
    mutationFn: async ({
      id,
      categoryIds,
      moveTo,
    }: {
      id: string;
      categoryIds: string[];
      moveTo: string | null;
    }) => {
      if (moveTo) {
        await mustSucceed(
          client.from('notes').update({ category_id: moveTo }).in('category_id', categoryIds),
        );
      }
      await mustSucceed(client.from('note_categories').delete().eq('id', id));
    },
  });
}

// ---------------------------------------------------------------------------- notas

export interface NoteDraft {
  categoryId: string;
  title: string | null;
  content: JSONContent;
}

function noteRow(d: NoteDraft): TablesInsert<'notes'> {
  return {
    category_id: d.categoryId,
    title: d.title?.trim() ? d.title.trim().slice(0, 200) : null,
    content: d.content,
    content_text: docToText(d.content).slice(0, 200_000),
  };
}

/** Cria ou atualiza; apaga do Storage as imagens que saíram do documento. */
export async function saveNote(
  client: LifeosClient,
  draft: NoteDraft,
  previous: Note | null,
): Promise<Note> {
  const row = noteRow(draft);
  const saved = previous
    ? await must(client.from('notes').update(row).eq('id', previous.id).select('*').single())
    : await must(client.from('notes').insert(row).select('*').single());
  if (previous) {
    const gone = removedImages(previous.content as JSONContent, draft.content);
    if (gone.length) await removeImages(client, gone);
  }
  return saved;
}

export function useNoteActions() {
  const client = useSupabase();
  const update = useLifeosMutation({
    affects: ['notes'],
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'notes'> }): Promise<Note> =>
      must(client.from('notes').update(patch).eq('id', id).select('*').single()),
  });
  const remove = useLifeosMutation({
    affects: ['notes'],
    success: 'Nota excluída.',
    mutationFn: async (note: Note) => {
      await mustSucceed(client.from('notes').delete().eq('id', note.id));
      const paths = imagePaths(note.content as JSONContent);
      if (paths.length) await removeImages(client, paths);
    },
  });
  return { update, remove };
}

// ---------------------------------------------------------------------------- imagens

const MAX_SIDE = 1600;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Reduz a imagem (lado maior até 1600 px, WebP) antes de enviar: cabem milhares no 1 GB. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new AppError('validation', 'Escolha um arquivo de imagem (JPG, PNG, WebP ou GIF).');
  }
  // GIF animado perderia a animação ao passar pelo canvas: vai como está.
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.82);
  });
  if (!blob) throw new AppError('unknown', 'Não foi possível preparar a imagem.');
  return blob;
}

async function currentUserId(client: LifeosClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError('session_expired', 'Sua sessão expirou. Entre novamente.');
  return id;
}

/** Envia uma imagem e devolve o caminho no Storage (guardado no documento da nota). */
export async function uploadNoteImage(client: LifeosClient, file: File): Promise<string> {
  const blob = await compressImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new AppError('validation', 'Imagem grande demais (máximo de 5 MB depois de reduzida).');
  }
  const uid = await currentUserId(client);
  const ext = blob.type === 'image/gif' ? 'gif' : 'webp';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage
    .from(NOTE_IMAGES_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) {
    // Erros do Storage chegam com mensagens técnicas ("not found", "Bucket…"): uma só, clara.
    throw new AppError(
      'unknown',
      'Não foi possível enviar a imagem. Verifique a conexão e tente de novo.',
    );
  }
  return path;
}

const blobUrls = new Map<string, Promise<string>>();

/** URL local (blob:) de uma imagem privada; cada caminho é baixado uma vez por sessão. */
export function noteImageUrl(client: LifeosClient, path: string): Promise<string> {
  let url = blobUrls.get(path);
  if (!url) {
    url = client.storage
      .from(NOTE_IMAGES_BUCKET)
      .download(path)
      .then(({ data, error }) => {
        if (error) throw toAppError(error);
        return URL.createObjectURL(data);
      });
    url.catch(() => blobUrls.delete(path));
    blobUrls.set(path, url);
  }
  return url;
}

export async function removeImages(client: LifeosClient, paths: string[]): Promise<void> {
  // Limpeza de melhor esforço: uma falha aqui não desfaz a nota já salva.
  try {
    await client.storage.from(NOTE_IMAGES_BUCKET).remove(paths);
  } catch {
    // Ignorado: arquivos órfãos não aparecem para ninguém (pasta privada).
  }
}

/** Apaga todas as imagens da conta (antes de excluir a conta). Melhor esforço. */
export async function removeAllNoteImages(client: LifeosClient): Promise<void> {
  try {
    const uid = await currentUserId(client);
    for (;;) {
      const { data, error } = await client.storage
        .from(NOTE_IMAGES_BUCKET)
        .list(uid, { limit: 1000 });
      if (error || !data.length) return;
      const { error: removeError } = await client.storage
        .from(NOTE_IMAGES_BUCKET)
        .remove(data.map((f) => `${uid}/${f.name}`));
      if (removeError) return;
    }
  } catch {
    // Sem Storage disponível: nada a apagar.
  }
}

/**
 * As tabelas das Notas ainda não existem no banco desta conta (migration
 * 20261104120000_notes não aplicada). PostgREST: PGRST205; Postgres: 42P01.
 */
export function isNotesSetupMissing(error: unknown): boolean {
  return error instanceof AppError && (error.code === 'PGRST205' || error.code === '42P01');
}

/** Código técnico do erro (sem dados do usuário), para o usuário informar no suporte. */
export function errorCode(error: unknown): string | null {
  return error instanceof AppError ? error.code : null;
}
