import { createContext, use } from 'react';
import type { DataSourceMode } from './data-source';

export interface DataSourceContextValue {
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
}

export const DataSourceContext = createContext<DataSourceContextValue | null>(null);

export function useDataSource(): DataSourceContextValue {
  const ctx = use(DataSourceContext);
  if (!ctx) throw new Error('useDataSource deve ser usado dentro de <DataSourceProvider>.');
  return ctx;
}
