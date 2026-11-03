import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * Grupo de opções exclusivas (padrão WAI-ARIA "radio group").
 * Setas movem e selecionam; Tab entra/sai do grupo pela opção selecionada.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabels = false,
  className,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  hideLabels?: boolean;
  className?: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const next = options[(index + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    const el = event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`);
    el?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex gap-0.5 rounded-lg border border-border bg-surface-muted/70 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={hideLabels ? option.label : undefined}
            title={hideLabels ? option.label : undefined}
            data-value={option.value}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              'inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-3 text-body-sm font-medium transition-colors duration-150',
              checked
                ? 'bg-primary-soft text-primary-soft-fg ring-1 ring-primary/35 ring-inset'
                : 'text-fg-subtle hover:bg-surface-raised/60 hover:text-fg',
            )}
          >
            {option.icon}
            {!hideLabels && option.label}
          </button>
        );
      })}
    </div>
  );
}
