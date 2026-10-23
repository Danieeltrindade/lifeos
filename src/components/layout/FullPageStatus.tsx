import type { ReactNode } from 'react';
import { BrandMark } from './Brand';

/** Tela cheia mínima para "verificando sessão" e configuração ausente. */
export function FullPageStatus({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="flex w-full max-w-lg flex-col items-center gap-4 text-center">
        <BrandMark className="size-10" />
        <h1 className="text-title-sm font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function SessionLoading() {
  return (
    <FullPageStatus title="LifeOS">
      <p role="status" className="text-body-sm text-fg-subtle">
        Verificando sua sessão…
      </p>
    </FullPageStatus>
  );
}
