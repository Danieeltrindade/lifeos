import { useCallback, useState } from 'react';

/**
 * Identificador de um registro AINDA NÃO criado, gerado no navegador. O mesmo id vai em todas as
 * tentativas de salvar o mesmo formulário — assim, se a resposta da primeira se perdeu na rede,
 * a segunda não cria uma cópia (ver insertOnce). `renew()` gera outro para o próximo registro
 * (formulários que continuam abertos depois de criar, como "adicionar subtarefa").
 */
export function useDraftId(): [string, () => void] {
  const [id, setId] = useState(newId);
  const renew = useCallback(() => {
    setId(newId());
  }, []);
  return [id, renew];
}

function newId(): string {
  return crypto.randomUUID();
}
