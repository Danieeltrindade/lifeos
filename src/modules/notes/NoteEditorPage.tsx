import { useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { ArrowLeft, Check, Copy, NotebookText, Pin, PinOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ListSkeleton } from '@/components/ui/QueryState';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/query/query-client';
import { toAppError } from '@/services/supabase/errors';
import { useSupabase } from '@/services/supabase/supabase-context';
import { NoteEditor } from './components/NoteEditor';
import { NotesSetupNotice } from './components/NotesSetupNotice';
import {
  isNotesSetupMissing,
  notesKeys,
  saveNote,
  useNoteActions,
  useNoteCategoriesQuery,
  useNotesQuery,
} from './data/notes-api';
import { copyText } from './logic/clipboard';
import {
  buildCategoryTree,
  docToText,
  EMPTY_DOC,
  isDoc,
  type Note,
  type NoteCategory,
} from './logic/notes';

const AUTOSAVE_MS = 800;

/** Editor completo de uma nota: /notas/nova (?categoria=) e /notas/:noteId. */
export function NoteEditorPage() {
  // "/notas/nova" e "/notas/:id" são a MESMA rota (:noteId), para que a primeira gravação
  // (que troca "nova" pelo id) não remonte o editor.
  const { noteId: param } = useParams();
  const noteId = param === 'nova' ? undefined : param;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [params] = useSearchParams();
  const categoriesQuery = useNoteCategoriesQuery();
  const notesQuery = useNotesQuery();
  const categories = categoriesQuery.data ?? [];
  const note = noteId ? notesQuery.data?.find((n) => n.id === noteId) : undefined;

  const loading = categoriesQuery.status === 'pending' || notesQuery.status === 'pending';
  const error = categoriesQuery.error ?? notesQuery.error;

  if (loading) return <ListSkeleton rows={3} />;
  if (error && isNotesSetupMissing(error)) {
    return (
      <NotesSetupNotice
        onRetry={() => {
          void categoriesQuery.refetch();
          void notesQuery.refetch();
        }}
      />
    );
  }
  if (error) {
    return (
      <ErrorState
        title="Não foi possível abrir a nota"
        description={errorMessage(error)}
        onRetry={() => {
          void categoriesQuery.refetch();
          void notesQuery.refetch();
        }}
      />
    );
  }
  if (categories.length === 0) {
    return (
      <EmptyState
        icon={<NotebookText />}
        title="Crie uma categoria primeiro"
        description="Toda nota fica dentro de uma categoria (por exemplo, Ideias ou Elogios)."
        action={
          <Link to="/notas" className={buttonClasses('primary')}>
            Ir para Notas
          </Link>
        }
      />
    );
  }
  if (noteId && !note) {
    return (
      <EmptyState
        icon={<NotebookText />}
        title="Nota não encontrada"
        description="Ela pode ter sido excluída."
        action={
          <Link to="/notas" className={buttonClasses('secondary')}>
            Voltar para Notas
          </Link>
        }
      />
    );
  }

  const requested = params.get('categoria');
  const initialCategory =
    note?.category_id ??
    (requested && categories.some((c) => c.id === requested)
      ? requested
      : (buildCategoryTree(categories)[0]?.id ?? ''));

  // A chave só muda entre notas diferentes; a primeira gravação de uma nota nova mantém o
  // editor (e o cursor) no lugar.
  const key = !noteId || noteId === createdId ? 'nova' : noteId;
  return (
    <EditorScreen
      key={key}
      onCreated={setCreatedId}
      note={note ?? null}
      categories={categories}
      initialCategory={initialCategory}
    />
  );
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

function EditorScreen({
  note,
  categories,
  initialCategory,
  onCreated,
}: {
  onCreated: (id: string) => void;
  note: Note | null;
  categories: readonly NoteCategory[];
  initialCategory: string;
}) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { update, remove } = useNoteActions();

  const [categoryId, setCategoryId] = useState(initialCategory);
  const [title, setTitle] = useState(note?.title ?? '');
  const [doc, setDoc] = useState<JSONContent>(() =>
    note && isDoc(note.content) ? note.content : EMPTY_DOC,
  );
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [state, setState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Gravação em série: nunca duas ao mesmo tempo; a última edição sempre é gravada.
  // Tudo em refs (lidas só em eventos e efeitos) para não depender de renderizações.
  const [current, setCurrent] = useState<Note | null>(note);
  const saved = useRef<Note | null>(note);
  const latest = useRef({ categoryId, title, doc });
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    latest.current = { categoryId, title, doc };
  });

  useEffect(() => {
    const schedule = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flushRef.current();
      }, AUTOSAVE_MS);
    };
    flushRef.current = () => {
      window.clearTimeout(timer.current);
      if (inFlight.current) return inFlight.current;
      if (!dirty.current) return Promise.resolve();
      const { categoryId: cat, title: t, doc: d } = latest.current;
      // Nota nova ainda vazia não é criada.
      if (!saved.current && !t.trim() && !docToText(d).trim()) {
        dirty.current = false;
        if (mounted.current) setState('idle');
        return Promise.resolve();
      }
      dirty.current = false;
      if (mounted.current) setState('saving');
      let failed = false;
      const run = saveNote(client, { categoryId: cat, title: t, content: d }, saved.current)
        .then((row) => {
          const isNew = !saved.current;
          saved.current = row;
          queryClient.setQueryData<Note[]>(notesKeys.list, (list) =>
            list ? [row, ...list.filter((n) => n.id !== row.id)] : [row],
          );
          if (!mounted.current) return;
          setCurrent(row);
          setSaveError(null);
          setState(dirty.current ? 'pending' : 'saved');
          if (isNew) {
            onCreated(row.id);
            void navigate(`/notas/${row.id}`, { replace: true });
          }
        })
        .catch((error: unknown) => {
          dirty.current = true;
          failed = true;
          if (mounted.current) {
            setState('error');
            setSaveError(toAppError(error).message);
          }
        })
        .finally(() => {
          inFlight.current = null;
          if (dirty.current && mounted.current && !failed) schedule();
        });
      inFlight.current = run;
      return run;
    };
  });

  const markDirty = () => {
    dirty.current = true;
    setState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void flushRef.current();
    }, AUTOSAVE_MS);
  };

  // Ao sair da tela, grava o que faltar e atualiza as listas.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void flushRef.current().finally(() => {
        void queryClient.invalidateQueries({ queryKey: ['notes'] });
      });
    };
  }, [queryClient]);

  // Fechar/recarregar a aba com alteração não gravada pede confirmação ao navegador.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  const tree = buildCategoryTree(categories);

  return (
    <div className="mx-auto flex w-full max-w-4xl animate-fade-up flex-col gap-4">
      {/* O título da nota é um campo editável; o título da página fica para leitores de tela. */}
      <h1 className="sr-only">{current ? 'Editar nota' : 'Nova nota'}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/notas?categoria=${categoryId}`}
          className={buttonClasses('ghost', 'sm', '-ml-2')}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Notas
        </Link>
        <SaveStatus
          state={state}
          error={saveError}
          onRetry={() => {
            dirty.current = true;
            void flushRef.current();
          }}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy className="size-4" />}
            onClick={() => {
              const text = [title.trim(), docToText(doc)].filter(Boolean).join('\n\n');
              void copyText(text).then((ok) => {
                toast.show(
                  ok
                    ? { tone: 'success', message: 'Texto copiado.' }
                    : { tone: 'danger', message: 'Não foi possível copiar.' },
                );
              });
            }}
          >
            <span className="hidden sm:inline">Copiar tudo</span>
            <span className="sr-only sm:hidden">Copiar tudo</span>
          </Button>
          {current && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={pinned}
                icon={pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                onClick={() => {
                  const next = !pinned;
                  setPinned(next);
                  update.mutate(
                    { id: current.id, patch: { pinned: next } },
                    {
                      onSuccess: (row) => {
                        if (saved.current) saved.current = { ...saved.current, pinned: row.pinned };
                        setCurrent((c) => (c ? { ...c, pinned: row.pinned } : c));
                      },
                      onError: () => {
                        setPinned(!next);
                      },
                    },
                  );
                }}
              >
                <span className="hidden sm:inline">{pinned ? 'Desafixar' : 'Fixar'}</span>
                <span className="sr-only sm:hidden">{pinned ? 'Desafixar' : 'Fixar'}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  setConfirmDelete(true);
                }}
              >
                <span className="hidden sm:inline">Excluir</span>
                <span className="sr-only sm:hidden">Excluir nota</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-elev-1 sm:p-6">
        <label className="flex w-fit max-w-full items-center gap-2 text-body-sm text-fg-muted">
          <span>Categoria</span>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              markDirty();
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
        <label className="sr-only" htmlFor="note-title">
          Título
        </label>
        <input
          id="note-title"
          value={title}
          maxLength={200}
          placeholder="Título (opcional)"
          autoFocus={!note}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          className="w-full bg-transparent text-title font-semibold tracking-tight text-fg outline-none placeholder:text-fg-subtle"
        />
        <NoteEditor
          label="Texto da nota"
          content={doc}
          placeholder="Escreva aqui… Dica: “- ” vira tópico, “1. ” vira lista numerada e “[] ” vira caixa de seleção."
          onChange={(d) => {
            setDoc(d);
            markDirty();
          }}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir nota"
        confirmLabel="Excluir nota"
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (!current) return;
          window.clearTimeout(timer.current);
          dirty.current = false;
          remove.mutate(current, {
            onSuccess: () => {
              void navigate(`/notas?categoria=${categoryId}`, { replace: true });
            },
          });
        }}
      >
        A nota será excluída definitivamente, com as imagens dela.
      </ConfirmDialog>
    </div>
  );
}

function SaveStatus({
  state,
  error,
  onRetry,
}: {
  state: SaveState;
  error: string | null;
  onRetry: () => void;
}) {
  if (state === 'error') {
    return (
      <span role="alert" className="flex items-center gap-2 text-caption text-danger">
        Não foi possível salvar{error ? `: ${error}` : ''}
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Tentar de novo
        </button>
      </span>
    );
  }
  const text =
    state === 'saving' || state === 'pending' ? 'Salvando…' : state === 'saved' ? 'Salvo' : '';
  return (
    <span
      role="status"
      className={cn('flex items-center gap-1 text-caption text-fg-subtle', !text && 'sr-only')}
    >
      {state === 'saved' && <Check aria-hidden="true" className="size-3.5" />}
      {text}
    </span>
  );
}
