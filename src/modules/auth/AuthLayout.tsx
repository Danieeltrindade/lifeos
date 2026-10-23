import { useEffect, type ReactNode } from 'react';
import { Brand } from '@/components/layout/Brand';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/** Moldura das telas públicas (entrar, cadastro, recuperação de senha). */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · LifeOS`;
  }, [title]);

  return (
    // overflow-x-clip: o brilho decorativo ultrapassa as bordas sem criar rolagem horizontal.
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-bg">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Brand />
        <ThemeToggle compact />
      </header>
      <main
        id="conteudo"
        className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0"
      >
        <div className="relative isolate w-full max-w-md animate-fade-up">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-16 -top-24 -z-10 h-72 [background:var(--hero-glow)] [mask-image:radial-gradient(closest-side,black,transparent)]"
          />
          <div className="rounded-lg border border-border bg-surface p-6 shadow-elev-2 sm:p-8">
            <h1 className="text-title font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1.5 text-body-sm text-fg-muted">{description}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-5 text-center text-body-sm text-fg-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export const linkClass = 'font-medium text-primary underline-offset-2 hover:underline';
