import { createContext, use } from 'react';
import type { LifeosClient } from './client';

export const SupabaseContext = createContext<LifeosClient | null>(null);

/** Cliente Supabase da aplicação. Injetado por <AppProviders> (e por um cliente falso nos testes). */
export function useSupabase(): LifeosClient {
  const client = use(SupabaseContext);
  if (!client) throw new Error('useSupabase deve ser usado dentro de <SupabaseContext>.');
  return client;
}
