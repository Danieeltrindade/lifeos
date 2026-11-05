import type { JSONContent } from '@tiptap/core';
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  NotebookText,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ListSkeleton } from '@/components/ui/QueryState';
import { SearchField } from '@/components/ui/SearchField';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { useLifeosMutation } from '@/lib/query/mutations';
import { errorMessage } from '@/lib/query/query-client';
import { pluralize } from '@/lib/text';
import { useSupabase } from '@/services/supabase/supabase-context';
import { CategoryDialog, DeleteCategoryDialog } from './components/CategoryDialog';
import { NoteCard } from './components/NoteCard';
import { NoteEditor } from './components/NoteEditor';
import {
  saveNote,
  useDeleteCategory,
  useNoteActions,
  useNoteCategoriesQuery,
  errorCode,
  isNotesSetupMissing,
  useNotesQuery,
} from './data/notes-api';
import { NotesSetupNotice } from './components/NotesSetupNotice';
import {
  buildCategoryTree,
  categoryAndChildren,
  docToText,
  EMPTY_DOC,
  noteMatches,
  sortNotes,
  type CategoryNode,
  type Note,
  type NoteCategory,
} from './logic/notes';

/** 'all', 'pinned' ou o id de uma categoria/subcategoria. */
type Scope = string;

export function NotesPage() {
  const categoriesQuery = useNoteCategoriesQuery();
  const notesQuery = useNotesQuery();
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get('categoria') ?? 'all';
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<NoteCategory | 'new' | null>(null);
  const [deletingCat, setDeletingCat] = useState<NoteCategory | null>(null);
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const { update, remove } = useNoteActions();
  const deleteCategory = useDeleteCategory();

  const setScope = (next: Scope) => {
    setParams(next === 'all' ? {} : { categoria: next }, { replace: true });
  };

  const selected = categories.find((c) => c.id === scope) ?? null;
  const selectedRoot = selected?.parent_id
    ? (categories.find((c) => c.id === selected.parent_id) ?? null)
    : selected;
  const rootNode = selectedRoot ? tree.find((n) => n.id === selectedRoot.id) : undefined;

  const visible = useMemo(() => {
    // A busca procura em todas as notas; sem busca, vale a categoria escolhida.
    let list: Note[] = notes;
    if (query.trim()) list = list.filter((n) => noteMatches(n, query, categories));
    else if (scope === 'pinned') list = list.filter((n) => n.pinned);
    else if (scope !== 'all') {
      const ids = categoryAndChildren(scope, categories);
      list = list.filter((n) => ids.has(n.category_id));
    }
    return sortNotes(list);
  }, [notes, categories, query, scope]);

  const countIn = (id: string) => {
    const ids = categoryAndChildren(id, categories);
    return notes.filter((n) => ids.has(n.category_id)).length;
  };

  const loading = categoriesQuery.status === 'pending' || notesQuery.status === 'pending';
  const error = categoriesQuery.error ?? notesQuery.error;
  const scopeTitle = query.trim()
    ? `Resultados para “${query.trim()}”`
    : scope === 'pinned'
      ? 'Fixadas'
      : selected
        ? selected.name
        : 'Todas as notas';
  const newNoteHref = selected ? `/notas/nova?categoria=${selected.id}` : '/notas/nova';

  return (
    <div className="animate-fade-up">
      <PageHeader
        module="notes"
        eyebrow="Registrar"
        title="Notas"
        description="Ideias, frases, listas e lugares — organizados nas suas categorias."
        actions={
          categories.length > 0 && (
            <Link to={newNoteHref} className={buttonClasses('primary')}>
              <Plus aria-hidden="true" className="size-4" />
              Nova nota
            </Link>
          )
        }
      />
      {loading ? (
        <ListSkeleton rows={4} />
      ) : error && isNotesSetupMissing(error) ? (
        <NotesSetupNotice
          onRetry={() => {
            void categoriesQuery.refetch();
            void notesQuery.refetch();
          }}
        />
      ) : error ? (
        <ErrorState
          title="Não foi possível carregar as notas"
          description={withCode(errorMessage(error), errorCode(error))}
          onRetry={() => {
            void categoriesQuery.refetch();
            void notesQuery.refetch();
          }}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<NotebookText />}
          title="Comece criando uma categoria"
          description="Por exemplo: Ideias, Elogios, Frases ou Lugares para ir. Depois é só escrever as notas dentro dela."
          action={
            <Button
              icon={<FolderPlus className="size-4" />}
              onClick={() => {
                setEditing('new');
              }}
            >
              Nova categoria
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {/* Celular/tablet: categorias em chips roláveis. */}
          <nav
            aria-label="Categorias"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
          >
            <Chip
              active={scope === 'all'}
              onClick={() => {
                setScope('all');
              }}
            >
              Todas <Count n={notes.length} />
            </Chip>
            {notes.some((n) => n.pinned) && (
              <Chip
                active={scope === 'pinned'}
                onClick={() => {
                  setScope('pinned');
                }}
              >
                <Pin aria-hidden="true" className="size-3.5" /> Fixadas
              </Chip>
            )}
            {tree.map((c) => (
              <Chip
                key={c.id}
                active={selectedRoot?.id === c.id}
                onClick={() => {
                  setScope(c.id);
                }}
              >
                <Dot color={c.color} /> {c.name} <Count n={countIn(c.id)} />
              </Chip>
            ))}
            <Chip
              onClick={() => {
                setEditing('new');
              }}
            >
              <Plus aria-hidden="true" className="size-3.5" /> Categoria
            </Chip>
          </nav>

          {/* Computador: painel lateral. */}
          <CategoryPanel
            tree={tree}
            scope={scope}
            totals={{ all: notes.length, pinned: notes.filter((n) => n.pinned).length }}
            countIn={countIn}
            onSelect={setScope}
            onNew={() => {
              setEditing('new');
            }}
            onEdit={(id) => {
              const c = categories.find((x) => x.id === id);
              const root = c?.parent_id ? categories.find((x) => x.id === c.parent_id) : c;
              if (root) setEditing(root);
            }}
            onDelete={(id) => {
              setDeletingCat(categories.find((x) => x.id === id) ?? null);
            }}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <SearchField
              label="Buscar em todas as notas"
              placeholder="Buscar em todas as notas…"
              value={query}
              onChange={setQuery}
            />

            {!query.trim() && rootNode && (
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  active={scope === rootNode.id}
                  onClick={() => {
                    setScope(rootNode.id);
                  }}
                >
                  Tudo em {rootNode.name}
                </Chip>
                {rootNode.children.map((s) => (
                  <Chip
                    key={s.id}
                    active={scope === s.id}
                    onClick={() => {
                      setScope(s.id);
                    }}
                  >
                    {s.name} <Count n={countIn(s.id)} />
                  </Chip>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil className="size-3.5" />}
                  onClick={() => {
                    if (selectedRoot) setEditing(selectedRoot);
                  }}
                >
                  {rootNode.children.length ? 'Editar' : 'Subcategorias'}
                </Button>
              </div>
            )}

            {!query.trim() && (
              <QuickNote
                categories={categories}
                defaultCategoryId={selected?.id ?? (tree[0]?.id as string)}
              />
            )}

            <section aria-labelledby="notes-list-title" className="flex flex-col gap-3">
              <h2
                id="notes-list-title"
                className="flex items-baseline gap-2 text-title-sm font-semibold"
              >
                {scopeTitle}
                <span className="text-body-sm font-normal text-fg-subtle">
                  {pluralize(visible.length, 'nota', 'notas')}
                </span>
              </h2>
              {visible.length === 0 ? (
                <EmptyState
                  compact
                  icon={<NotebookText />}
                  title={query.trim() ? 'Nada encontrado' : 'Nenhuma nota aqui ainda'}
                  description={
                    query.trim()
                      ? 'A busca procura no título, no texto e no nome da categoria.'
                      : 'Use a nota rápida acima ou abra o editor completo.'
                  }
                  action={
                    !query.trim() && (
                      <Link to={newNoteHref} className={buttonClasses('secondary', 'sm')}>
                        <Plus aria-hidden="true" className="size-4" />
                        Nova nota
                      </Link>
                    )
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {visible.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      categories={categories}
                      onTogglePin={(note) => {
                        update.mutate({ id: note.id, patch: { pinned: !note.pinned } });
                      }}
                      onDelete={setDeletingNote}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {editing !== null && (
        <CategoryDialog
          open
          category={editing === 'new' ? undefined : editing}
          categories={categories}
          notes={notes}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(c) => {
            if (editing === 'new') setScope(c.id);
          }}
        />
      )}
      <DeleteCategoryDialog
        key={deletingCat?.id ?? 'none'}
        category={deletingCat}
        categories={categories}
        notes={notes}
        pending={deleteCategory.isPending}
        onCancel={() => {
          setDeletingCat(null);
        }}
        onConfirm={(moveTo) => {
          if (!deletingCat) return;
          const ids = [...categoryAndChildren(deletingCat.id, categories)];
          deleteCategory.mutate(
            { id: deletingCat.id, categoryIds: ids, moveTo },
            {
              onSuccess: () => {
                if (ids.includes(scope)) setScope(moveTo ?? 'all');
                setDeletingCat(null);
              },
            },
          );
        }}
      />
      <ConfirmDialog
        open={deletingNote !== null}
        title="Excluir nota"
        confirmLabel="Excluir nota"
        pending={remove.isPending}
        onCancel={() => {
          setDeletingNote(null);
        }}
        onConfirm={() => {
          if (!deletingNote) return;
          remove.mutate(deletingNote, {
            onSuccess: () => {
              setDeletingNote(null);
            },
          });
        }}
      >
        {deletingNote?.title ? `“${deletingNote.title}” ` : 'A nota '}será excluída definitivamente,
        com as imagens dela.
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------- painel

function CategoryPanel({
  tree,
  scope,
  totals,
  countIn,
  onSelect,
  onNew,
  onEdit,
  onDelete,
}: {
  tree: CategoryNode[];
  scope: Scope;
  totals: { all: number; pinned: number };
  countIn: (id: string) => number;
  onSelect: (scope: Scope) => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <aside
      aria-label="Categorias"
      className="hidden self-start rounded-lg border border-border bg-surface p-2 shadow-elev-1 lg:sticky lg:top-6 lg:block"
    >
      <ul className="flex flex-col gap-0.5">
        <PanelItem
          active={scope === 'all'}
          onClick={() => {
            onSelect('all');
          }}
          count={totals.all}
        >
          <NotebookText aria-hidden="true" className="size-4" /> Todas as notas
        </PanelItem>
        {totals.pinned > 0 && (
          <PanelItem
            active={scope === 'pinned'}
            onClick={() => {
              onSelect('pinned');
            }}
            count={totals.pinned}
          >
            <Pin aria-hidden="true" className="size-4" /> Fixadas
          </PanelItem>
        )}
      </ul>
      <p className="mt-3 mb-1 px-2.5 text-caption font-semibold tracking-wide text-fg-subtle uppercase">
        Categorias
      </p>
      <ul className="flex flex-col gap-0.5">
        {tree.map((c) => {
          const open = !collapsed.has(c.id);
          return (
            <li key={c.id}>
              <div className="group/cat flex items-center">
                {c.children.length > 0 ? (
                  <button
                    type="button"
                    aria-label={open ? `Recolher ${c.name}` : `Expandir ${c.name}`}
                    aria-expanded={open}
                    onClick={() => {
                      setCollapsed((s) => {
                        const next = new Set(s);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      });
                    }}
                    className="grid size-7 shrink-0 place-items-center rounded text-fg-subtle hover:text-fg"
                  >
                    {open ? (
                      <ChevronDown aria-hidden="true" className="size-3.5" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="size-3.5" />
                    )}
                  </button>
                ) : (
                  <span className="size-7 shrink-0" />
                )}
                <PanelButton
                  active={scope === c.id}
                  onClick={() => {
                    onSelect(c.id);
                  }}
                  count={countIn(c.id)}
                >
                  <Dot color={c.color} /> <span className="truncate">{c.name}</span>
                </PanelButton>
                <RowActions
                  name={c.name}
                  onEdit={() => {
                    onEdit(c.id);
                  }}
                  onDelete={() => {
                    onDelete(c.id);
                  }}
                />
              </div>
              {open && c.children.length > 0 && (
                <ul className="ml-7 flex flex-col gap-0.5 border-l border-border pl-1">
                  {c.children.map((s) => (
                    <li key={s.id} className="group/cat flex items-center">
                      <PanelButton
                        active={scope === s.id}
                        onClick={() => {
                          onSelect(s.id);
                        }}
                        count={countIn(s.id)}
                      >
                        <span className="truncate">{s.name}</span>
                      </PanelButton>
                      <RowActions
                        name={s.name}
                        onEdit={() => {
                          onEdit(s.id);
                        }}
                        onDelete={() => {
                          onDelete(s.id);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onNew}
        className="mt-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border-strong px-2.5 py-2 text-body-sm text-fg-muted hover:bg-surface-muted hover:text-fg"
      >
        <FolderPlus aria-hidden="true" className="size-4" /> Nova categoria
      </button>
    </aside>
  );
}

function PanelItem(props: Parameters<typeof PanelButton>[0]) {
  return (
    <li className="flex">
      <PanelButton {...props} />
    </li>
  );
}

function PanelButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 text-left text-body-sm transition-colors',
        active
          ? 'bg-primary-soft font-medium text-primary-soft-fg'
          : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
      )}
    >
      {children}
      <span className="ml-auto pl-1 text-caption text-fg-subtle tabular-nums">{count}</span>
    </button>
  );
}

function RowActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cls =
    'grid size-7 shrink-0 place-items-center rounded text-fg-subtle opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover/cat:opacity-100';
  return (
    <>
      <button
        type="button"
        aria-label={`Editar ${name}`}
        title="Editar"
        onClick={onEdit}
        className={cls}
      >
        <Pencil aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Excluir ${name}`}
        title="Excluir"
        onClick={onDelete}
        className={cls}
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </button>
    </>
  );
}

function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-body-sm whitespace-nowrap transition-colors',
        active
          ? 'border-primary/50 bg-primary-soft font-medium text-primary-soft-fg'
          : 'border-border-strong text-fg-muted hover:bg-surface-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      data-swatch=""
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-caption text-fg-subtle tabular-nums">{n}</span>;
}

// ---------------------------------------------------------------------------- nota rápida

function QuickNote({
  categories,
  defaultCategoryId,
}: {
  categories: readonly NoteCategory[];
  defaultCategoryId: string;
}) {
  const client = useSupabase();
  const [doc, setDoc] = useState<JSONContent>(EMPTY_DOC);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const effectiveCategory =
    categoryId && categories.some((c) => c.id === categoryId) ? categoryId : defaultCategoryId;
  const create = useLifeosMutation({
    affects: ['notes'],
    success: 'Nota salva.',
    mutationFn: () =>
      saveNote(client, { categoryId: effectiveCategory, title: null, content: doc }, null),
  });
  const empty = !docToText(doc).trim();
  const tree = buildCategoryTree(categories);

  return (
    <section
      aria-label="Nota rápida"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-elev-1"
    >
      <NoteEditor
        key={version}
        compact
        label="Nota rápida"
        placeholder="Anote algo rápido…"
        content={EMPTY_DOC}
        onChange={setDoc}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 items-center gap-2 text-body-sm text-fg-muted">
          <span>Salvar em</span>
          <select
            value={effectiveCategory}
            onChange={(e) => {
              setCategoryId(e.target.value);
            }}
            className="h-10 min-w-0 rounded-md border border-border-strong bg-surface-raised px-2 text-body-sm text-fg"
          >
            {tree.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name}</option>
                {c.children.map((s) => (
                  <option key={s.id} value={s.id}>
                    {c.name} › {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Button
          className="ml-auto"
          size="sm"
          disabled={empty || create.isPending}
          onClick={() => {
            create.mutate(undefined, {
              onSuccess: () => {
                setDoc(EMPTY_DOC);
                setVersion((v) => v + 1);
              },
            });
          }}
        >
          {create.isPending ? 'Salvando…' : 'Salvar nota'}
        </Button>
      </div>
    </section>
  );
}

/** Acrescenta o código técnico (ex.: PGRST205) à mensagem, para facilitar o diagnóstico. */
function withCode(message: string, code: string | null): string {
  return code && !['NETWORK', 'ABORTED'].includes(code) ? `${message} (código ${code})` : message;
}
