/** Visualizações (React) dos nós de imagem e vídeo do editor das Notas. */
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { ExternalLink, ImageOff, Play, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { useSupabase } from '@/services/supabase/supabase-context';
import { noteImageUrl } from '../data/notes-api';
import { parseVideoUrl } from '../logic/notes';

export function NoteImageView({ node, selected, deleteNode, editor }: ReactNodeViewProps) {
  const client = useSupabase();
  const path = typeof node.attrs.path === 'string' ? node.attrs.path : '';
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const [state, setState] = useState<{ path: string; url?: string; failed?: boolean }>({ path });

  useEffect(() => {
    let alive = true;
    if (!path) return;
    noteImageUrl(client, path).then(
      (url) => {
        if (alive) setState({ path, url });
      },
      () => {
        if (alive) setState({ path, failed: true });
      },
    );
    return () => {
      alive = false;
    };
  }, [client, path]);

  const current = state.path === path ? state : { path };
  return (
    <NodeViewWrapper
      as="figure"
      className={cn(
        'lo-note-image relative my-4 overflow-hidden rounded-lg border border-border bg-surface-muted',
        selected && 'ring-2 ring-primary',
      )}
      data-drag-handle=""
    >
      {current.url ? (
        <img src={current.url} alt={alt} className="block max-h-[70vh] w-full object-contain" />
      ) : current.failed ? (
        <span className="flex items-center justify-center gap-2 p-8 text-body-sm text-fg-subtle">
          <ImageOff aria-hidden="true" className="size-4" />
          Não foi possível carregar a imagem.
        </span>
      ) : (
        <span className="block aspect-video w-full skeleton" aria-label="Carregando imagem" />
      )}
      {editor.isEditable && (
        <button
          type="button"
          onClick={() => {
            deleteNode();
          }}
          className="absolute top-2 right-2 grid size-9 place-items-center rounded-md bg-overlay text-white opacity-0 transition-opacity focus-visible:opacity-100 [figure:hover_&]:opacity-100"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          <span className="sr-only">Remover imagem</span>
        </button>
      )}
    </NodeViewWrapper>
  );
}

export function VideoLinkView({ node, selected, deleteNode, editor }: ReactNodeViewProps) {
  const url = typeof node.attrs.url === 'string' ? node.attrs.url : '';
  const info = parseVideoUrl(url);
  return (
    <NodeViewWrapper
      className={cn(
        'my-4 flex items-center gap-3 rounded-lg border border-border-strong bg-surface-muted p-3',
        selected && 'ring-2 ring-primary',
      )}
      data-drag-handle=""
    >
      <span
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center rounded-md bg-bg text-fg"
      >
        <Play className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-fg-subtle">Vídeo · {info?.label ?? 'link'}</span>
        <a
          href={info?.url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 font-medium text-primary-soft-fg underline-offset-2 hover:underline"
        >
          <span className="truncate">
            {info ? `${info.host}${new URL(info.url).pathname}` : url}
          </span>
          <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      </span>
      {editor.isEditable && (
        <button
          type="button"
          onClick={() => {
            deleteNode();
          }}
          className="grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-raised hover:text-fg"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          <span className="sr-only">Remover vídeo</span>
        </button>
      )}
    </NodeViewWrapper>
  );
}
