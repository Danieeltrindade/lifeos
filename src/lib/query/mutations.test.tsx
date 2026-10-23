import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, onTestFinished } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { useLifeosMutation } from './mutations';

/**
 * Regressão (Fase 5): callbacks passados a mutate(vars, { onSuccess }) NÃO rodam no TanStack
 * Query quando o componente que chamou desmonta antes do fim — e aqui ele desmonta justamente
 * porque a revalidação mostra o dado novo. Era o que impedia a reflexão de abrir ao encerrar
 * uma sessão e o redirecionamento depois de excluir uma matéria/projeto/meta.
 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O "banco" do teste: a sessão ativa existe até ser encerrada. */
interface FakeDb {
  isActive: () => boolean;
  finish: () => void;
}

function Harness({ db, onDone }: { db: FakeDb; onDone: (v: string) => void }) {
  const q = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => delay(20).then(() => db.isActive()),
  });
  // Outra leitura do mesmo domínio, mais lenta (como a lista de sessões recentes): a
  // revalidação só termina depois dela, mas a sessão ativa já some antes.
  useQuery({ queryKey: ['sessions', 'recent'], queryFn: () => delay(60).then(() => []) });
  if (q.isPending) return null;
  return q.data ? <Child onDone={onDone} finish={db.finish} /> : <p>sem sessão</p>;
}

function Child({ onDone, finish }: { onDone: (v: string) => void; finish: () => void }) {
  const complete = useLifeosMutation({
    affects: ['sessions'],
    mutationFn: (id: string) => {
      finish();
      return delay(20).then(() => id);
    },
  });
  return (
    <button
      type="button"
      onClick={() => {
        complete.mutate('s1', {
          onSuccess: (id) => {
            onDone(id);
          },
        });
      }}
    >
      Encerrar
    </button>
  );
}

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

describe('useLifeosMutation', () => {
  it('chama o onSuccess de mutate() mesmo quando a revalidação desmonta quem chamou', async () => {
    // Como no navegador: o React aplica as atualizações na hora, sem a fila do act().
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined };
    const previous = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = false;
    onTestFinished(() => {
      g.IS_REACT_ACT_ENVIRONMENT = previous;
    });
    const done: string[] = [];
    let active = true;
    const db: FakeDb = {
      isActive: () => active,
      finish: () => {
        active = false;
      },
    };
    render(
      wrap(
        <Harness
          db={db}
          onDone={(v) => {
            done.push(v);
          }}
        />,
      ),
    );
    (await screen.findByRole('button', { name: 'Encerrar' })).click();
    expect(await screen.findByText('sem sessão')).toBeInTheDocument();
    await delay(100);
    expect(done).toEqual(['s1']);
  });
});
