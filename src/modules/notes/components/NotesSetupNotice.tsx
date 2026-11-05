import { DatabaseZap } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * O app já tem a aba Notas, mas o banco (Supabase) ainda não recebeu a migration que cria
 * as tabelas. Explica o que fazer em vez de um "Algo deu errado" genérico.
 */
export function NotesSetupNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      role="alert"
      className="flex flex-col gap-4 rounded-lg border border-warning/30 bg-warning-soft p-5"
    >
      <div className="flex items-start gap-3">
        <DatabaseZap aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-body font-semibold text-fg">
            As Notas ainda não foram ativadas no seu banco de dados
          </h2>
          <p className="text-body-sm text-fg-muted">
            O aplicativo já foi atualizado, mas o Supabase ainda não tem as tabelas das Notas. Isso
            se resolve aplicando a atualização do banco uma vez.
          </p>
        </div>
      </div>
      <ol className="ml-8 flex list-decimal flex-col gap-1.5 pl-4 text-body-sm text-fg-muted">
        <li>
          <strong className="text-fg">Antes de tudo, guarde o Diário:</strong> em Configurações →
          Conta e dados, clique em “Exportar meus dados (JSON)”. A atualização apaga o Diário.
        </li>
        <li>
          No terminal, dentro da pasta do LifeOS, rode{' '}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-fg">
            npm run db:push
          </code>{' '}
          e confirme com “Y”.
        </li>
        <li>Volte aqui e clique em “Tentar novamente”.</li>
      </ol>
      <div className="ml-8">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    </section>
  );
}
