import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * Confirmação de ação destrutiva ou irreversível. O botão de confirmar descreve a ação
 * ("Excluir tarefa"), nunca um "OK" genérico; o foco inicial fica em "Cancelar".
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'danger',
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      closeDisabled={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending} data-autofocus="">
            Cancelar
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Aguarde…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-body-sm text-fg-muted">{children}</div>
    </Dialog>
  );
}
