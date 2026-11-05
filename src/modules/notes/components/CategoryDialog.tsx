import { Check, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/query/query-client';
import { useSaveCategory, type CategoryDraft } from '../data/notes-api';
import {
  colorName,
  DEFAULT_NOTE_COLOR,
  NOTE_COLORS,
  normalizeColor,
  type Note,
  type NoteCategory,
} from '../logic/notes';

interface SubRow {
  key: string;
  id?: string;
  name: string;
}

/** Criar ou editar uma categoria: nome, cor (24 opções + personalizada) e subcategorias. */
export function CategoryDialog({
  open,
  category,
  categories,
  notes,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Categoria (raiz) em edição; ausente = nova. */
  category?: NoteCategory | undefined;
  categories: readonly NoteCategory[];
  notes: readonly Note[];
  onClose: () => void;
  onSaved?: (category: NoteCategory) => void;
}) {
  const save = useSaveCategory();
  const nameId = useId();
  // O diálogo é montado a cada abertura (ver NotesPage): o estado nasce dos dados atuais.
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? DEFAULT_NOTE_COLOR);
  const [subs, setSubs] = useState<SubRow[]>(() =>
    category
      ? categories
          .filter((c) => c.parent_id === category.id)
          .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'))
          .map((c) => ({ key: c.id, id: c.id, name: c.name }))
      : [],
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [newSub, setNewSub] = useState('');
  const [error, setError] = useState<string | null>(null);

  const notesIn = (id: string) => notes.filter((n) => n.category_id === id).length;

  const addSub = () => {
    const v = newSub.trim();
    if (!v) return;
    if (subs.some((s) => s.name.toLowerCase() === v.toLowerCase())) {
      setError(`Já existe a subcategoria "${v}".`);
      return;
    }
    setSubs((list) => [...list, { key: crypto.randomUUID(), name: v.slice(0, 60) }]);
    setNewSub('');
    setError(null);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Dê um nome para a categoria.');
      return;
    }
    const cleanSubs = subs.map((s) => ({ ...s, name: s.name.trim() }));
    if (cleanSubs.some((s) => !s.name)) {
      setError('Subcategorias precisam de nome.');
      return;
    }
    const lower = cleanSubs.map((s) => s.name.toLowerCase());
    if (new Set(lower).size !== lower.length) {
      setError('Duas subcategorias com o mesmo nome.');
      return;
    }
    const pending = newSub.trim();
    if (pending && !lower.includes(pending.toLowerCase())) {
      cleanSubs.push({ key: 'pending', name: pending.slice(0, 60) });
    }
    const draft: CategoryDraft = {
      ...(category ? { id: category.id } : {}),
      name: trimmed.slice(0, 60),
      color,
      subcategories: cleanSubs.map((s) => (s.id ? { id: s.id, name: s.name } : { name: s.name })),
      removedSubIds: removed,
    };
    save.mutate(draft, {
      onSuccess: (saved) => {
        onSaved?.(saved);
        onClose();
      },
    });
  };

  const isPreset = NOTE_COLORS.some((c) => c.hex === color);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeDisabled={save.isPending}
      title={category ? 'Editar categoria' : 'Nova categoria'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : category ? 'Salvar' : 'Criar categoria'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          id={nameId}
          label="Nome"
          placeholder="Ex.: Ideias, Elogios, Lugares para ir"
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          data-autofocus=""
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-body-sm font-medium text-fg-muted">
            Cor <span className="font-normal text-fg-subtle">· {colorName(color)}</span>
          </legend>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={color === c.hex}
                onClick={() => {
                  setColor(c.hex);
                }}
                className={cn(
                  'grid aspect-square w-full place-items-center rounded-md ring-offset-2 ring-offset-surface transition-shadow',
                  color === c.hex && 'ring-2 ring-fg',
                )}
                style={{ backgroundColor: c.hex }}
              >
                {color === c.hex && <Check aria-hidden="true" className="size-4 text-white" />}
              </button>
            ))}
          </div>
          <label className="mt-1 inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border-strong px-2.5 py-1.5 text-body-sm text-fg-muted hover:bg-surface-muted">
            <input
              type="color"
              value={color}
              onChange={(e) => {
                const v = normalizeColor(e.target.value);
                if (v) setColor(v);
              }}
              className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            {isPreset ? 'Outra cor…' : `Personalizada ${color}`}
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-body-sm font-medium text-fg-muted">
            Subcategorias <span className="font-normal text-fg-subtle">(opcional)</span>
          </legend>
          {subs.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {subs.map((s, i) => {
                const count = s.id ? notesIn(s.id) : 0;
                return (
                  <li key={s.key} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      data-swatch=""
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <input
                      aria-label={`Nome da subcategoria ${String(i + 1)}`}
                      value={s.name}
                      maxLength={60}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSubs((list) =>
                          list.map((x) => (x.key === s.key ? { ...x, name: v } : x)),
                        );
                      }}
                      className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-2.5 text-body-sm text-fg"
                    />
                    {count > 0 ? (
                      <span
                        className="w-24 shrink-0 text-right text-caption text-fg-subtle"
                        title="Mova ou exclua as notas para remover esta subcategoria"
                      >
                        {count === 1 ? '1 nota' : `${String(count)} notas`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remover subcategoria ${s.name || String(i + 1)}`}
                        onClick={() => {
                          setSubs((list) => list.filter((x) => x.key !== s.key));
                          if (s.id) setRemoved((r) => [...r, s.id as string]);
                        }}
                        className="grid size-10 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <input
              aria-label="Nova subcategoria"
              placeholder="Ex.: Engraçadas, Românticas…"
              value={newSub}
              maxLength={60}
              onChange={(e) => {
                setNewSub(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSub();
                }
              }}
              className="h-10 min-w-0 flex-1 rounded-md border border-dashed border-border-strong bg-transparent px-2.5 text-body-sm text-fg placeholder:text-fg-subtle"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="size-4" />}
              onClick={addSub}
              disabled={!newSub.trim()}
            >
              Adicionar
            </Button>
          </div>
        </fieldset>

        <div className="flex items-center gap-2 rounded-md bg-surface-muted/60 px-3 py-2.5 text-body-sm">
          <span className="text-fg-subtle">Prévia:</span>
          <span
            data-swatch=""
            aria-hidden="true"
            className="size-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-fg">{name.trim() || 'Categoria'}</span>
          {subs[0] && <span className="truncate text-fg-subtle">› {subs[0].name}</span>}
        </div>

        {(error ?? save.error) && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {error ?? errorMessage(save.error)}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Exclui uma categoria; se ela (ou as subcategorias) tiver notas, pede o destino delas. */
export function DeleteCategoryDialog({
  category,
  categories,
  notes,
  pending,
  onCancel,
  onConfirm,
}: {
  category: NoteCategory | null;
  categories: readonly NoteCategory[];
  notes: readonly Note[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (moveTo: string | null) => void;
}) {
  const ids = category
    ? new Set([
        category.id,
        ...categories.filter((c) => c.parent_id === category.id).map((c) => c.id),
      ])
    : new Set<string>();
  const count = notes.filter((n) => ids.has(n.category_id)).length;
  const targets = categories.filter((c) => !ids.has(c.id));
  const [moveTo, setMoveTo] = useState('');
  const selectId = useId();
  const parent = category?.parent_id ? categories.find((c) => c.id === category.parent_id) : null;
  const label = (c: NoteCategory) => {
    const p = c.parent_id ? categories.find((x) => x.id === c.parent_id) : null;
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const blocked = count > 0 && targets.length === 0;

  return (
    <Dialog
      open={category !== null}
      onClose={onCancel}
      closeDisabled={pending}
      title={parent ? 'Excluir subcategoria' : 'Excluir categoria'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending} data-autofocus="">
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={pending || blocked || (count > 0 && !moveTo)}
            onClick={() => {
              onConfirm(count > 0 ? moveTo : null);
            }}
          >
            {pending ? 'Aguarde…' : count > 0 ? 'Mover notas e excluir' : 'Excluir'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm text-fg-muted">
        <p>
          <strong className="text-fg">{category?.name}</strong>
          {!parent && ids.size > 1
            ? ` e as ${String(ids.size - 1)} subcategorias dela serão excluídas.`
            : ' será excluída.'}
        </p>
        {count > 0 &&
          (blocked ? (
            <p>
              Há {count === 1 ? '1 nota' : `${String(count)} notas`} aqui e nenhuma outra categoria
              para recebê-las. Crie outra categoria ou exclua as notas antes.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={selectId} className="font-medium text-fg-muted">
                Mover {count === 1 ? 'a nota' : `as ${String(count)} notas`} para
              </label>
              <select
                id={selectId}
                value={moveTo}
                onChange={(e) => {
                  setMoveTo(e.target.value);
                }}
                className="h-11 rounded-md border border-border-strong bg-surface-raised px-2.5 text-body-sm text-fg"
              >
                <option value="">Escolha…</option>
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </div>
          ))}
      </div>
    </Dialog>
  );
}
