import type { JSONContent } from '@tiptap/core';
import { Copy, ImageIcon, Pin, PinOff, Trash2, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useToast } from '@/components/ui/toast-context';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { cn } from '@/lib/cn';
import { formatDateOnly, formatTime, localDateIn, relativeDayLabel } from '@/lib/date';
import {
  categoryLabel,
  imagePaths,
  noteExcerpt,
  videoLinks,
  type Note,
  type NoteCategory,
} from '../logic/notes';
import { copyText } from '../logic/clipboard';

export function NoteCard({
  note,
  categories,
  onTogglePin,
  onDelete,
}: {
  note: Note;
  categories: readonly NoteCategory[];
  onTogglePin: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  const toast = useToast();
  const { timezone, today } = useUserCalendar();
  const cat = categoryLabel(note.category_id, categories);
  const doc = note.content as JSONContent;
  const images = imagePaths(doc).length;
  const videos = videoLinks(doc).length;
  const excerpt = noteExcerpt(note.content_text);
  // Sem título, a primeira linha faz as vezes de título (sem o marcador de lista).
  const firstLine = (excerpt.split('\n')[0] ?? '').replace(/^(•|☐|☑|>|\d+\.)\s+/, '');
  const title = note.title ?? (firstLine || 'Nota sem texto');
  const body = note.title ? excerpt : excerpt.split('\n').slice(1).join('\n');
  const day = localDateIn(new Date(note.updated_at), timezone);
  const rel = relativeDayLabel(day, today);
  const when =
    rel === 'Hoje'
      ? `Hoje, ${formatTime(note.updated_at, timezone)}`
      : rel === 'Ontem'
        ? 'Ontem'
        : formatDateOnly(day);

  return (
    <article
      className={cn(
        'group relative flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-4 shadow-elev-1 transition-colors hover:border-border-strong',
        note.pinned ? 'border-primary/40' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 text-caption text-fg-subtle">
        <span
          aria-hidden="true"
          data-swatch=""
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: cat.color }}
        />
        <span className="truncate">{cat.label}</span>
        {note.pinned && (
          <Pin aria-label="Fixada" className="ml-auto size-3.5 shrink-0 text-primary-soft-fg" />
        )}
      </div>
      <h3 className="text-body font-semibold text-fg">
        {/* O link cobre o cartão inteiro; os botões ficam acima dele. */}
        <Link
          to={`/notas/${note.id}`}
          className="line-clamp-2 after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
        >
          {title}
        </Link>
      </h3>
      {body && (
        <p className="line-clamp-6 text-body-sm whitespace-pre-line text-fg-muted">{body}</p>
      )}
      <div className="mt-auto flex items-center gap-1 pt-1">
        <span className="mr-auto flex items-center gap-2.5 text-caption text-fg-subtle">
          <span>{when}</span>
          {images > 0 && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon aria-hidden="true" className="size-3.5" />
              <span className="sr-only">Imagens:</span>
              {images}
            </span>
          )}
          {videos > 0 && (
            <span className="inline-flex items-center gap-1">
              <Video aria-hidden="true" className="size-3.5" />
              <span className="sr-only">Vídeos:</span>
              {videos}
            </span>
          )}
        </span>
        <CardAction
          label="Copiar texto"
          onClick={() => {
            void copyText([note.title, note.content_text].filter(Boolean).join('\n\n')).then(
              (ok) => {
                toast.show(
                  ok
                    ? { tone: 'success', message: 'Nota copiada.' }
                    : { tone: 'danger', message: 'Não foi possível copiar.' },
                );
              },
            );
          }}
        >
          <Copy />
        </CardAction>
        <CardAction
          label={note.pinned ? 'Desafixar' : 'Fixar no topo'}
          onClick={() => {
            onTogglePin(note);
          }}
        >
          {note.pinned ? <PinOff /> : <Pin />}
        </CardAction>
        <CardAction
          label="Excluir nota"
          onClick={() => {
            onDelete(note);
          }}
        >
          <Trash2 />
        </CardAction>
      </div>
    </article>
  );
}

function CardAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="relative z-10 grid size-9 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
