import { useMemo } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { createLifeosClient } from '@/services/supabase/client';
import { readSupabaseConfig, type SupabaseConfig } from '@/services/supabase/config';
import { AppProviders } from './providers';
import { routes } from './router';
import { SetupRequiredPage } from './SetupRequiredPage';

const configResult = readSupabaseConfig(import.meta.env);

export function App() {
  if (!configResult.ok) return <SetupRequiredPage problems={configResult.problems} />;
  return <ConfiguredApp config={configResult.config} />;
}

function ConfiguredApp({ config }: { config: SupabaseConfig }) {
  const client = useMemo(() => createLifeosClient(config), [config]);
  const router = useMemo(() => createBrowserRouter(routes), []);
  return (
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
