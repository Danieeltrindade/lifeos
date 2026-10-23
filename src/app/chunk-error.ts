/**
 * Falha ao carregar o código de uma tela. Acontece sobretudo depois de um novo deploy: a aba
 * aberta ainda aponta para arquivos da versão anterior, que deixaram de existir.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically/i.test(
    message,
  );
}
