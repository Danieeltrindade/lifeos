import { useCallback } from 'react';
import {
  useMutation,
  useQueryClient,
  type MutateOptions,
  type MutationFunctionContext,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast-context';
import { toAppError } from '@/services/supabase/errors';
import { affectedDomains, type DataDomain } from './domains';

export interface LifeosMutationOptions<TData, TVars, TContext> extends Omit<
  UseMutationOptions<TData, Error, TVars, TContext>,
  'mutationFn' | 'onSettled'
> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Domínios que esta escrita altera; dependentes são invalidados automaticamente. */
  affects: DataDomain[];
  /** Mensagem de sucesso (toast). Omitida quando a própria tela mostra o resultado. */
  success?: string | ((data: TData, vars: TVars) => string);
  /** Silencia o toast de erro (a tela exibe o erro no formulário). */
  silentError?: boolean;
}

/**
 * Escrita padrão do LifeOS: executa, converte erros em mensagens seguras, mostra o
 * resultado e, com sucesso OU falha, revalida todos os domínios afetados — assim uma
 * atualização otimista que falhou é desfeita pelo dado real do banco.
 */
export function useLifeosMutation<TData, TVars = void, TContext = unknown>(
  options: LifeosMutationOptions<TData, TVars, TContext>,
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { affects, success, silentError, onError, onSuccess, mutationFn, ...rest } = options;
  const mutation = useMutation<TData, Error, TVars, TContext>({
    ...rest,
    mutationFn: async (vars) => {
      try {
        return await mutationFn(vars);
      } catch (error) {
        throw toAppError(error);
      }
    },
    onSuccess: (data, vars, context, ctx) => {
      if (success)
        toast.show({
          tone: 'success',
          message: typeof success === 'string' ? success : success(data, vars),
        });
      return onSuccess?.(data, vars, context, ctx);
    },
    onError: (error, vars, context, ctx) => {
      if (!silentError) toast.show({ tone: 'danger', message: toAppError(error).message });
      return onError?.(error, vars, context, ctx);
    },
    onSettled: () =>
      Promise.all(
        affectedDomains(affects).map((domain) =>
          queryClient.invalidateQueries({ queryKey: [domain] }),
        ),
      ),
  });

  // O TanStack Query só chama os callbacks passados a mutate(vars, { onSuccess }) se o
  // componente que chamou ainda estiver montado quando a escrita termina. Aqui a escrita só
  // termina depois da revalidação — que frequentemente desmonta quem chamou (a sessão ativa
  // some ao encerrar; a matéria excluída vira "não encontrada"). Resultado: a reflexão não
  // abria e o redirecionamento após excluir não acontecia. Via mutateAsync, os callbacks
  // rodam sempre; erros continuam tratados pelo onError do hook (toast).
  const { mutateAsync } = mutation;
  const mutate = useCallback(
    (vars: TVars, opts?: MutateOptions<TData, Error, TVars, TContext>) => {
      const noContext = undefined as TContext;
      const fnContext = undefined as unknown as MutationFunctionContext;
      mutateAsync(vars).then(
        (data) => {
          opts?.onSuccess?.(data, vars, noContext, fnContext);
          opts?.onSettled?.(data, null, vars, noContext, fnContext);
        },
        (error: unknown) => {
          const appError = toAppError(error);
          opts?.onError?.(appError, vars, noContext, fnContext);
          opts?.onSettled?.(undefined, appError, vars, noContext, fnContext);
        },
      );
    },
    [mutateAsync],
  );
  return { ...mutation, mutate };
}
