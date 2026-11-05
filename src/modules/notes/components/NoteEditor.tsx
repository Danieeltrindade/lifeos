import type { JSONContent } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Video,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/toast-context';
import { cn } from '@/lib/cn';
import { toAppError } from '@/services/supabase/errors';
import { useSupabase } from '@/services/supabase/supabase-context';
import { uploadNoteImage } from '../data/notes-api';
import { parseVideoUrl } from '../logic/notes';
import { NoteImage, VideoLink } from './extensions';

/**
 * Cores de texto como VARIÁVEIS do tema (não hex fixo): a mesma marcação fica legível no
 * modo claro e no escuro, em qualquer paleta (ver --lo-text-* em index.css).
 */
const TEXT_COLORS: { name: string; value: string | null }[] = [
  { name: 'Padrão', value: null },
  { name: 'Vermelho', value: 'var(--lo-text-red)' },
  { name: 'Laranja', value: 'var(--lo-text-orange)' },
  { name: 'Verde', value: 'var(--lo-text-green)' },
  { name: 'Azul', value: 'var(--lo-text-blue)' },
  { name: 'Roxo', value: 'var(--lo-text-purple)' },
];

export function NoteEditor({
  content,
  onChange,
  compact = false,
  placeholder = 'Escreva aqui…',
  label,
  autoFocus = false,
  onReady,
}: {
  content: JSONContent;
  onChange: (doc: JSONContent) => void;
  /** Versão curta (nota rápida): barra de ferramentas reduzida e área menor. */
  compact?: boolean;
  placeholder?: string;
  label: string;
  autoFocus?: boolean;
  onReady?: (editor: Editor) => void;
}) {
  const client = useSupabase();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dialog, setDialog] = useState<null | 'link' | 'video'>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const uploadAndInsert = async (editor: Editor, files: File[], at?: number) => {
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const path = await uploadNoteImage(client, file);
        const node = { type: 'image', attrs: { path, alt: file.name.replace(/\.[^.]+$/, '') } };
        if (at !== undefined) editor.chain().focus().insertContentAt(at, node).run();
        else editor.chain().focus().insertContent(node).run();
      } catch (error) {
        toast.show({ tone: 'danger', message: toAppError(error).message });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const uploadRef = useRef(uploadAndInsert);
  useEffect(() => {
    uploadRef.current = uploadAndInsert;
  });

  const editor = useEditor({
    immediatelyRender: true,
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      Highlight,
      Placeholder.configure({ placeholder }),
      NoteImage,
      VideoLink,
    ],
    content,
    editorProps: {
      attributes: {
        class: cn('lo-prose outline-none', compact ? 'min-h-16' : 'min-h-[50vh]'),
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true',
      },
      // Colar ou soltar imagens envia para o Storage e insere no lugar.
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (!files.length || !editorRef.current) return false;
        void uploadRef.current(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (!files.length || !editorRef.current) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadRef.current(editorRef.current, files, pos);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getJSON());
    },
  });
  const editorRef = useRef<Editor | null>(editor);
  useEffect(() => {
    editorRef.current = editor;
    onReady?.(editor);
  }, [editor, onReady]);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border-strong bg-surface-muted/40 focus-within:border-primary',
      )}
    >
      <Toolbar
        editor={editor}
        compact={compact}
        uploading={uploading > 0}
        onImage={() => fileRef.current?.click()}
        onLink={() => {
          setDialog('link');
        }}
        onVideo={() => {
          setDialog('video');
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void uploadAndInsert(editor, files);
        }}
      />
      <div className={cn('cursor-text', compact ? 'px-3 py-2.5' : 'px-4 py-4 sm:px-8 sm:py-6')}>
        <EditorContent editor={editor} />
      </div>
      {uploading > 0 && (
        <p role="status" className="border-t border-border px-3 py-2 text-caption text-fg-muted">
          Enviando imagem…
        </p>
      )}
      {dialog === 'link' && (
        <LinkDialog
          editor={editor}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === 'video' && (
        <VideoDialog
          editor={editor}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- barra

function Toolbar({
  editor,
  compact,
  uploading,
  onImage,
  onLink,
  onVideo,
}: {
  editor: Editor;
  compact: boolean;
  uploading: boolean;
  onImage: () => void;
  onLink: () => void;
  onVideo: () => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canSink: e.can().sinkListItem('listItem') || e.can().sinkListItem('taskItem'),
      canLift: e.can().liftListItem('listItem') || e.can().liftListItem('taskItem'),
    }),
  });
  const c = () => editor.chain().focus();
  const block = s.h2 ? 'h2' : s.h3 ? 'h3' : 'p';

  return (
    <div
      role="toolbar"
      aria-label="Formatação do texto"
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-1.5 py-1"
    >
      {!compact && (
        <>
          <Tool label="Desfazer (Ctrl+Z)" disabled={!s.canUndo} onClick={() => c().undo().run()}>
            <Undo2 />
          </Tool>
          <Tool label="Refazer (Ctrl+Y)" disabled={!s.canRedo} onClick={() => c().redo().run()}>
            <Redo2 />
          </Tool>
          <Divider />
          <label className="mx-0.5 inline-flex">
            <span className="sr-only">Estilo do parágrafo</span>
            <select
              value={block}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'p') c().setParagraph().run();
                else
                  c()
                    .toggleHeading({ level: v === 'h2' ? 2 : 3 })
                    .run();
              }}
              className="h-9 rounded-md border border-border-strong bg-surface-muted pr-8 pl-2 text-body-sm text-fg"
            >
              <option value="p">Texto normal</option>
              <option value="h2">Título</option>
              <option value="h3">Subtítulo</option>
            </select>
          </label>
          <Divider />
        </>
      )}
      <Tool label="Negrito (Ctrl+B)" active={s.bold} onClick={() => c().toggleBold().run()}>
        <Bold />
      </Tool>
      <Tool label="Itálico (Ctrl+I)" active={s.italic} onClick={() => c().toggleItalic().run()}>
        <Italic />
      </Tool>
      {!compact && (
        <>
          <Tool
            label="Sublinhado (Ctrl+U)"
            active={s.underline}
            onClick={() => c().toggleUnderline().run()}
          >
            <Underline />
          </Tool>
          <Tool label="Riscado" active={s.strike} onClick={() => c().toggleStrike().run()}>
            <Strikethrough />
          </Tool>
          <ColorMenu editor={editor} />
          <Tool
            label="Marca-texto"
            active={s.highlight}
            onClick={() => c().toggleHighlight().run()}
          >
            <Highlighter />
          </Tool>
        </>
      )}
      <Divider />
      <Tool
        label="Lista com tópicos"
        active={s.bullet}
        onClick={() => c().toggleBulletList().run()}
      >
        <List />
      </Tool>
      <Tool label="Lista numerada" active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered />
      </Tool>
      <Tool label="Caixas de seleção" active={s.task} onClick={() => c().toggleTaskList().run()}>
        <ListChecks />
      </Tool>
      {!compact && (
        <>
          <Tool
            label="Aumentar recuo (Tab)"
            disabled={!s.canSink}
            onClick={() => {
              if (!c().sinkListItem('listItem').run()) c().sinkListItem('taskItem').run();
            }}
          >
            <IndentIncrease />
          </Tool>
          <Tool
            label="Diminuir recuo (Shift+Tab)"
            disabled={!s.canLift}
            onClick={() => {
              if (!c().liftListItem('listItem').run()) c().liftListItem('taskItem').run();
            }}
          >
            <IndentDecrease />
          </Tool>
          <Divider />
          <Tool label="Citação" active={s.quote} onClick={() => c().toggleBlockquote().run()}>
            <Quote />
          </Tool>
          <Tool label="Linha divisória" onClick={() => c().setHorizontalRule().run()}>
            <Minus />
          </Tool>
        </>
      )}
      <Divider />
      <Tool label="Link" active={s.link} onClick={onLink}>
        <Link2 />
      </Tool>
      <Tool label="Inserir imagem" disabled={uploading} onClick={onImage}>
        <ImagePlus />
      </Tool>
      {!compact && (
        <>
          <Tool label="Inserir vídeo (link)" onClick={onVideo}>
            <Video />
          </Tool>
          <Divider />
          <Tool label="Limpar formatação" onClick={() => c().unsetAllMarks().clearNodes().run()}>
            <RemoveFormatting />
          </Tool>
        </>
      )}
    </div>
  );
}

function Tool({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Não tira o foco (nem a seleção) do texto ao clicar.
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={onClick}
      className={cn(
        'grid size-10 place-items-center rounded-md text-fg-muted transition-colors sm:size-9 [&_svg]:size-4',
        'hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-primary-soft text-primary-soft-fg',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />;
}

function ColorMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Tool
        label="Cor do texto"
        active={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <Palette />
      </Tool>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Cor do texto"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          className="absolute top-full left-0 z-20 mt-1 flex gap-1 rounded-lg border border-border-strong bg-surface-raised p-1.5 shadow-elev-3"
        >
          {TEXT_COLORS.map((color) => (
            <button
              key={color.name}
              type="button"
              title={color.name}
              aria-label={color.name}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                const chain = editor.chain().focus();
                if (color.value) chain.setColor(color.value).run();
                else chain.unsetColor().run();
                setOpen(false);
              }}
              className="grid size-9 place-items-center rounded-md text-body font-bold hover:bg-surface-muted"
              style={{ color: color.value ?? 'var(--lo-fg)' }}
            >
              A
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- diálogos

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [current] = useState(() => editor.getAttributes('link').href as string | undefined);
  const [value, setValue] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const raw = value.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    const href = /^[a-z]+:/i.test(raw) ? raw : `https://${raw}`;
    if (!/^https?:\/\//i.test(href)) {
      setError('Use um link que comece com http:// ou https://');
      return;
    }
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={current ? 'Editar link' : 'Inserir link'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply}>{value.trim() || !current ? 'Aplicar' : 'Remover link'}</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <TextField
          label="Endereço"
          inputMode="url"
          placeholder="https://…"
          value={value}
          error={error ?? undefined}
          hint="Com texto selecionado, o link vai para a seleção."
          onChange={(e) => {
            setValue(e.target.value);
          }}
          data-autofocus=""
        />
      </form>
    </Dialog>
  );
}

function VideoDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const info = parseVideoUrl(/^[a-z]+:/i.test(value.trim()) ? value : `https://${value.trim()}`);
    if (!value.trim() || !info) {
      setError('Cole o link do vídeo (TikTok, YouTube, Instagram…).');
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: 'videoLink', attrs: { url: info.url } })
      .run();
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Inserir vídeo"
      description="O vídeo não é enviado: a nota guarda o link e mostra um cartão para abrir."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply}>Inserir</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <TextField
          label="Link do vídeo"
          inputMode="url"
          placeholder="https://www.tiktok.com/@…"
          value={value}
          error={error ?? undefined}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          data-autofocus=""
        />
      </form>
    </Dialog>
  );
}
