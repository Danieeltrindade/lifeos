import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Campos de formulário acessíveis: rótulo visível, dica e erro ligados por
 * aria-describedby, aria-invalid quando há erro e altura mínima de 44 px (toque).
 * Compatíveis com register() do React Hook Form (ref repassada como prop no React 19).
 */
const controlClass =
  'h-11 w-full rounded-md border bg-surface-raised px-3 text-body text-fg shadow-elev-1 transition-colors placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:text-fg-disabled';

interface FieldFrameProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  inputId: string;
  hintId: string;
  errorId: string;
  children: ReactNode;
}

function FieldFrame({ label, error, hint, inputId, hintId, errorId, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-caption text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(error: string | undefined, hint: ReactNode, hintId: string, errorId: string) {
  if (error) return errorId;
  if (hint) return hintId;
  return undefined;
}

export interface TextFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'children'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function TextField({ label, error, hint, id, className, ...props }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <FieldFrame {...{ label, error, hint, inputId, hintId, errorId }}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error, hint, hintId, errorId)}
        className={cn(controlClass, error ? 'border-danger' : 'border-border-strong', className)}
        {...props}
      />
    </FieldFrame>
  );
}

export interface SelectFieldProps extends ComponentPropsWithRef<'select'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function SelectField({
  label,
  error,
  hint,
  id,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <FieldFrame {...{ label, error, hint, inputId, hintId, errorId }}>
      <select
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error, hint, hintId, errorId)}
        className={cn(
          controlClass,
          'pr-8',
          error ? 'border-danger' : 'border-border-strong',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export interface TextareaFieldProps extends Omit<ComponentPropsWithRef<'textarea'>, 'children'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function TextareaField({
  label,
  error,
  hint,
  id,
  className,
  rows = 3,
  ...props
}: TextareaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <FieldFrame {...{ label, error, hint, inputId, hintId, errorId }}>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error, hint, hintId, errorId)}
        className={cn(
          controlClass,
          'h-auto min-h-11 resize-y py-2.5 leading-relaxed',
          error ? 'border-danger' : 'border-border-strong',
          className,
        )}
        {...props}
      />
    </FieldFrame>
  );
}

export interface CheckboxFieldProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'children'
> {
  label: ReactNode;
  hint?: ReactNode;
}

/** Caixa de seleção com rótulo clicável e área de toque de 44 px. */
export function CheckboxField({ label, hint, id, className, ...props }: CheckboxFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  return (
    <div className={cn('flex min-h-11 items-start gap-3 py-2', className)}>
      <input
        id={inputId}
        type="checkbox"
        aria-describedby={hint ? hintId : undefined}
        className="mt-0.5 size-5 shrink-0 accent-[var(--lo-primary)]"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-body-sm font-medium text-fg">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="text-caption text-fg-subtle">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
