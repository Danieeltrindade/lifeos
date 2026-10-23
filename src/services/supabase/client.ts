import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from './config';
import type { Database } from './database.types';

export type LifeosClient = SupabaseClient<Database>;

/** Chave do localStorage onde o supabase-js guarda a sessão (persistência entre recargas). */
export const AUTH_STORAGE_KEY = 'lifeos-auth';

/**
 * Cria o cliente Supabase do navegador.
 *  - flowType "pkce": links de e-mail (confirmação, recuperação) trazem um código de uso
 *    único trocado por sessão neste navegador — nada de tokens no fragmento da URL;
 *  - persistSession + autoRefreshToken: a sessão sobrevive a recargas e o token de acesso
 *    é renovado antes de expirar; se a renovação falhar, o evento SIGNED_OUT é emitido.
 */
export function createLifeosClient(config: SupabaseConfig): LifeosClient {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
}
