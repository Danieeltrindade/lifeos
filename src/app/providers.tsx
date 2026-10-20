import type { ReactNode } from 'react';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { DataSourceProvider } from '@/services/data-source/DataSourceProvider';
import type { DataSourceMode } from '@/services/data-source/data-source';

export function AppProviders({
  children,
  dataSource,
}: {
  children: ReactNode;
  dataSource?: DataSourceMode;
}) {
  return (
    <ThemeProvider>
      <DataSourceProvider {...(dataSource ? { initialMode: dataSource } : {})}>
        {children}
      </DataSourceProvider>
    </ThemeProvider>
  );
}
