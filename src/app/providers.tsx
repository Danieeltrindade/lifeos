import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { AuthProvider } from '@/services/auth/AuthProvider';
import { DataSourceProvider } from '@/services/data-source/DataSourceProvider';
import type { DataSourceMode } from '@/services/data-source/data-source';
import { ProfileProvider } from '@/services/profile/ProfileProvider';
import type { LifeosClient } from '@/services/supabase/client';
import { SupabaseContext } from '@/services/supabase/supabase-context';

/**
 * Ordem: tema (antes de tudo, evita flash) → avisos → cliente Supabase → sessão → perfil
 * (depende da sessão e sincroniza o tema) → fonte de dados → cache de leituras (um por usuário).
 */
export function AppProviders({
  children,
  client,
  dataSource,
}: {
  children: ReactNode;
  client: LifeosClient;
  dataSource?: DataSourceMode;
}) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SupabaseContext value={client}>
          <AuthProvider>
            <ProfileProvider>
              <DataSourceProvider {...(dataSource ? { initialMode: dataSource } : {})}>
                <QueryProvider>{children}</QueryProvider>
              </DataSourceProvider>
            </ProfileProvider>
          </AuthProvider>
        </SupabaseContext>
      </ToastProvider>
    </ThemeProvider>
  );
}
