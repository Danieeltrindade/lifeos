import { Archive, ArchiveRestore, Check } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Category } from '@/services/data/queries';
import { useSaveCategory } from '../data/activity-api';

/**
 * Categorias de atividade: criar, renomear, arquivar. Arquivar (e não excluir) preserva o
 * histórico: atividades antigas continuam com a categoria; ela só sai das opções.
 */
export function CategoryManager({ categories }: { categories: readonly Category[] }) {
  const save = useSaveCategory();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = name.trim();
          if (!value) return;
          save.mutate(
            { row: { name: value } },
            {
              onSuccess: () => {
                setName('');
              },
            },
          );
        }}
      >
        <label htmlFor="new-category" className="sr-only">
          Nova categoria
        </label>
        <input
          id="new-category"
          value={name}
          maxLength={60}
          placeholder="Nova categoria"
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
        />
        <Button size="sm" type="submit" disabled={!name.trim() || save.isPending}>
          Adicionar
        </Button>
      </form>
      {categories.length === 0 ? (
        <p className="text-body-sm text-fg-subtle">
          Nenhuma categoria. Exemplos: Saúde, Idiomas, Música.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => {
            const draft = editing[c.id] ?? c.name;
            const changed = draft.trim() !== c.name && draft.trim() !== '';
            return (
              <li key={c.id} className="flex items-center gap-2">
                <label htmlFor={`category-${c.id}`} className="sr-only">
                  Nome da categoria {c.name}
                </label>
                <input
                  id={`category-${c.id}`}
                  value={draft}
                  maxLength={60}
                  onChange={(e) => {
                    setEditing((m) => ({ ...m, [c.id]: e.target.value }));
                  }}
                  className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-body-sm"
                />
                {c.archived_at && <Badge tone="warning">Arquivada</Badge>}
                {changed && (
                  <button
                    type="button"
                    aria-label={`Salvar nome de ${c.name}`}
                    onClick={() => {
                      save.mutate({ id: c.id, row: { name: draft.trim() } });
                    }}
                    className="grid size-9 place-items-center rounded-md text-primary hover:bg-surface-muted"
                  >
                    <Check aria-hidden="true" className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={c.archived_at ? `Restaurar ${c.name}` : `Arquivar ${c.name}`}
                  onClick={() => {
                    save.mutate({
                      id: c.id,
                      row: {
                        name: c.name,
                        archived_at: c.archived_at ? null : new Date().toISOString(),
                      },
                    });
                  }}
                  className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
                >
                  {c.archived_at ? (
                    <ArchiveRestore aria-hidden="true" className="size-4" />
                  ) : (
                    <Archive aria-hidden="true" className="size-4" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
