import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Pilha de diálogos abertos: só o do topo responde a Esc e prende o foco. */
const stack: symbol[] = [];

/**
 * Diálogo modal acessível (padrão WAI-ARIA "dialog (modal)"):
 *  - role="dialog", aria-modal, título ligado por aria-labelledby;
 *  - foco vai para o primeiro campo (ou para `initialFocus`), fica preso dentro e volta
 *    ao elemento de origem ao fechar; Esc fecha (apenas o diálogo do topo);
 *  - o restante da página fica inerte; em telas pequenas vira uma folha inferior.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Impede fechar (ex.: enquanto salva). */
  closeDisabled?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  });

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    stack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const isTop = () => stack[stack.length - 1] === token;
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    const initial =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      focusables().find((el) => el.dataset.dialogClose === undefined) ??
      panel;
    initial?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (!isTop()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root && stack.length === 1) root.inert = true;
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      if (root && stack.length === 0) root.inert = wasInert;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-overlay"
        onClick={() => {
          if (!closeDisabled) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-fade-up flex-col rounded-t-xl border border-border bg-surface shadow-elev-3 outline-none sm:rounded-xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title-sm font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-0.5 text-body-sm text-fg-muted">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            data-dialog-close=""
            aria-label="Fechar"
            disabled={closeDisabled}
            onClick={onClose}
            className="-m-1.5 grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
