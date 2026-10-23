import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { ToastContext, type ToastInput, type ToastTone } from './toast-context';

interface ToastItem extends ToastInput {
  id: number;
}

const ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  danger: XCircle,
  info: Info,
};

const ICON_COLORS: Record<ToastTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
};

const DURATION_MS = 5000;

/**
 * Avisos temporários de resultado (salvo, excluído, falhou). Ficam numa região aria-live
 * (erros como "assertive"), somem sozinhos em 5 s — 10 s quando há ação — e podem ser
 * fechados. Pausam enquanto o ponteiro está sobre eles. A região fica fora de #root
 * (portal), então continua anunciada mesmo com um diálogo aberto (#root inerte).
 *
 * Posição: topo, centralizado. Embaixo (como era até a Fase 4) o aviso cobria os botões do
 * rodapé dos diálogos — justamente "Salvar/Tentar de novo" depois de um erro — e, no celular,
 * o rodapé da folha inferior. No topo ele só cobre o título do diálogo, que não é interativo.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-3), { ...toast, id }]);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4">
          <div aria-live="polite" className="contents">
            {items
              .filter((t) => t.tone !== 'danger')
              .map((t) => (
                <ToastView key={t.id} toast={t} onDismiss={dismiss} />
              ))}
          </div>
          <div aria-live="assertive" className="contents">
            {items
              .filter((t) => t.tone === 'danger')
              .map((t) => (
                <ToastView key={t.id} toast={t} onDismiss={dismiss} />
              ))}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const tone = toast.tone ?? 'info';
  const Icon = ICONS[tone];
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(
      () => {
        onDismiss(toast.id);
      },
      toast.action ? DURATION_MS * 2 : DURATION_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [paused, toast.id, toast.action, onDismiss]);

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-lg border border-border bg-surface-raised p-3.5 text-body-sm shadow-elev-3"
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', ICON_COLORS[tone])} />
      <p className="min-w-0 flex-1 text-fg">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          className="shrink-0 rounded-sm font-medium text-primary hover:underline"
          onClick={() => {
            toast.action?.onAction();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Fechar aviso"
        className="-m-1 grid size-7 shrink-0 place-items-center rounded-sm text-fg-subtle hover:text-fg"
        onClick={() => {
          onDismiss(toast.id);
        }}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
