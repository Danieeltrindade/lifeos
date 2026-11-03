import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PALETTES, type PaletteId, type PaletteInfo } from '@/lib/theme/palettes';
import { useTheme } from '@/lib/theme/theme-context';

/**
 * Seleção da paleta de cores. Cada card recebe `data-accent` com a SUA paleta: a prévia usa os
 * mesmos tokens da aplicação (fundo, cartão, botão, progresso, texto), então mostra as cores
 * reais de cada tema no modo atual. A escolha é aplicada na hora e salva na conta.
 *
 * Semântica: grupo de rádios nativos (setas trocam a opção, Tab entra e sai do grupo).
 */
export function PalettePicker() {
  const { palette, setPalette } = useTheme();
  return (
    <fieldset>
      <legend className="sr-only">Tema de cores</legend>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))]">
        {PALETTES.map((p) => (
          <li key={p.id} className="min-w-0">
            <PaletteCard info={p} checked={p.id === palette} onSelect={setPalette} />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function PaletteCard({
  info,
  checked,
  onSelect,
}: {
  info: PaletteInfo;
  checked: boolean;
  onSelect: (id: PaletteId) => void;
}) {
  const nameId = `palette-${info.id}-name`;
  const descriptionId = `palette-${info.id}-desc`;
  return (
    <label
      data-accent={info.id}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col gap-2.5 rounded-lg border bg-surface p-2.5 text-fg transition-[border-color,box-shadow] duration-150',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
        checked
          ? 'border-primary shadow-glow'
          : 'border-border hover:border-primary/50 hover:shadow-elev-2',
      )}
    >
      <input
        type="radio"
        name="palette"
        value={info.id}
        checked={checked}
        onChange={() => {
          onSelect(info.id);
        }}
        aria-labelledby={nameId}
        aria-describedby={descriptionId}
        className="sr-only"
      />
      <Preview />
      <div className="flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <p id={nameId} className="text-body-sm font-semibold">
            {info.name}
            <span className="sr-only"> — {info.color}</span>
          </p>
          <p id={descriptionId} className="text-caption text-fg-subtle">
            {info.color} · {info.description}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
            checked
              ? 'border-primary bg-primary text-primary-fg'
              : 'border-border-strong text-transparent',
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </div>
      <Swatches />
    </label>
  );
}

/** Miniatura da interface com os tokens da paleta (puramente visual). */
function Preview() {
  return (
    <div
      aria-hidden="true"
      className="flex h-24 overflow-hidden rounded-md border border-border bg-bg [background-image:var(--lo-app-bg)]"
    >
      <div className="flex w-1/4 flex-col gap-1.5 border-r border-border bg-sidebar p-1.5">
        <span className="size-3 rounded-[3px] bg-linear-to-br from-[var(--lo-brand-from)] to-[var(--lo-brand-to)]" />
        <span className="h-2 rounded-sm bg-primary-soft ring-1 ring-primary/30 ring-inset" />
        <span className="h-1.5 w-3/4 rounded-sm bg-fg-subtle/30" />
        <span className="h-1.5 w-2/3 rounded-sm bg-fg-subtle/30" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="surface-card flex flex-1 flex-col gap-1.5 rounded-[5px] border border-border p-1.5">
          <span className="h-1.5 w-1/2 rounded-sm bg-fg/70" />
          <span className="h-1 w-4/5 rounded-sm bg-fg-subtle/40" />
          <span className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-progress-track">
            <span className="block h-full w-3/5 rounded-full bg-linear-to-r from-primary/60 to-primary" />
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-3.5 w-10 rounded-[4px] bg-primary shadow-glow" />
          <span className="h-3.5 w-7 rounded-[4px] border border-border-strong bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}

function Swatches() {
  const swatches = [
    'bg-primary',
    'bg-primary-hover',
    'bg-primary-soft-fg',
    'bg-primary-soft ring-1 ring-primary/30 ring-inset',
    'bg-surface-muted ring-1 ring-border ring-inset',
  ];
  return (
    <div aria-hidden="true" className="flex gap-1 px-0.5">
      {swatches.map((cls) => (
        <span key={cls} className={cn('h-2.5 flex-1 rounded-full', cls)} />
      ))}
    </div>
  );
}
