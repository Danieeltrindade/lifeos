import { createContext, use } from 'react';

export type ToastTone = 'success' | 'danger' | 'info';

export interface ToastInput {
  tone?: ToastTone;
  message: string;
  /** Ação opcional (ex.: "Desfazer"). */
  action?: { label: string; onAction: () => void };
}

export interface ToastContextValue {
  show: (toast: ToastInput) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  return ctx;
}
