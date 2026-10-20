type Listener = (event: MediaQueryListEvent) => void;

/**
 * matchMedia controlável para testes (o jsdom não o implementa).
 * Retorna uma função para simular a troca de tema do sistema operacional.
 */
export function installMatchMedia(initialDark: boolean): (dark: boolean) => void {
  let dark = initialDark;
  const listeners = new Set<Listener>();

  window.matchMedia = (query: string) => {
    const isDarkQuery = query.includes('prefers-color-scheme: dark');
    return {
      get matches() {
        return isDarkQuery ? dark : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };

  return (next: boolean) => {
    dark = next;
    listeners.forEach((listener) => {
      listener({ matches: next } as MediaQueryListEvent);
    });
  };
}
