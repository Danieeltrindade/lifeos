import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { persistDataSource, readDataSource, type DataSourceMode } from './data-source';
import { DataSourceContext } from './data-source-context';

export function DataSourceProvider({
  children,
  initialMode,
}: {
  children: ReactNode;
  /** Usado em testes para fixar o modo sem tocar no localStorage. */
  initialMode?: DataSourceMode;
}) {
  const [mode, setModeState] = useState<DataSourceMode>(() => initialMode ?? readDataSource());

  const setMode = useCallback((next: DataSourceMode) => {
    setModeState(next);
    persistDataSource(next);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <DataSourceContext value={value}>{children}</DataSourceContext>;
}
