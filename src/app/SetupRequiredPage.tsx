import { useEffect } from 'react';
import { FullPageStatus } from '@/components/layout/FullPageStatus';
import { Notice } from '@/components/ui/Notice';

/**
 * Exibida quando as variáveis do Supabase faltam ou são inseguras. Sem backend
 * configurado não há como autenticar — e o app não finge que há.
 */
export function SetupRequiredPage({ problems }: { problems: string[] }) {
  useEffect(() => {
    document.title = 'Configuração necessária · LifeOS';
  }, []);

  return (
    <FullPageStatus title="Configuração necessária">
      <Notice
        tone="warning"
        className="w-full text-left"
        title="O LifeOS não está ligado ao Supabase"
      >
        <ul className="mt-1 list-disc pl-4">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Notice>
      <div className="w-full rounded-md border border-border surface-card p-4 text-left text-body-sm text-fg-muted">
        <p>
          Copie <code className="font-mono text-fg">.env.example</code> para{' '}
          <code className="font-mono text-fg">.env.local</code>, preencha a URL do projeto e a chave{' '}
          <strong>publishable</strong> (ou anon) e reinicie{' '}
          <code className="font-mono">npm run dev</code>.
        </p>
        <p className="mt-2">Passo a passo: docs/supabase-setup.md.</p>
      </div>
    </FullPageStatus>
  );
}
