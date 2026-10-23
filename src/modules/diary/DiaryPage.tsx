import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Lock, NotebookPen, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { QueryState } from '@/components/ui/QueryState';
import { SearchField } from '@/components/ui/SearchField';
import { EmptyState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { inputValue, optionalInt, optionalText } from '@/lib/forms';
import { useLifeosMutation } from '@/lib/query/mutations';
import { matchesSearch } from '@/lib/text';
import { qk } from '@/services/data/queries';
import type { Tables } from '@/services/supabase/database.types';
import { fetchAll, must, mustSucceed } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';

type Entry = Tables<'diary_entries'>;

const SCALE = ['', 'Muito baixo', 'Baixo', 'Neutro', 'Bom', 'Muito bom'];

const longDate = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const formatEntryDate = (isoDate: string) => {
  const text = longDate.format(Date.parse(`${isoDate}T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function useDiaryQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.diary,
    queryFn: ({ signal }) =>
      fetchAll((lo, hi) =>
        client
          .from('diary_entries')
          .select('*')
          .order('local_date', { ascending: false })
          .order('id', { ascending: true })
          .range(lo, hi)
          .abortSignal(signal),
      ),
  });
}

/**
 * Diário privado. O conteúdo é do usuário e de mais ninguém: protegido por RLS, fora de
 * estatísticas, recomendações e do dashboard, e nunca escrito em logs.
 */
export function DiaryPage() {
  const { today } = useUserCalendar();
  const query = useDiaryQuery();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<null | { mode: 'new' } | { mode: 'edit'; id: string }>(null);
  const entries = query.data ?? [];
  const editing = open?.mode === 'edit' ? entries.find((e) => e.id === open.id) : undefined;
  const todayEntry = entries.find((e) => e.local_date === today);

  const startNew = () => {
    setOpen(todayEntry ? { mode: 'edit', id: todayEntry.id } : { mode: 'new' });
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <NotebookPen aria-hidden="true" className="size-4" />
            Registrar
          </span>
        }
        title="Diário"
        description="Reflexões datadas, só suas."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={startNew}>
            {todayEntry ? 'Continuar hoje' : 'Escrever hoje'}
          </Button>
        }
      />
      <div className="mb-4 flex items-start gap-2 rounded-md bg-surface-muted p-3 text-body-sm text-fg-muted">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          Privado: só a sua conta lê estas entradas (regra no banco). O diário não entra em
          estatísticas, recomendações nem no dashboard.
        </p>
      </div>
      <SearchField className="mb-4" label="Buscar no diário" value={search} onChange={setSearch} />
      <QueryState query={query} title="Não foi possível carregar o diário">
        {(list) => {
          if (list.length === 0) {
            return (
              <EmptyState
                icon={<NotebookPen className="size-6" />}
                title="Nenhuma entrada ainda"
                description="Escreva sobre o seu dia: o que funcionou, o que pesou, o que aprendeu."
                action={
                  <Button icon={<Plus className="size-4" />} onClick={startNew}>
                    Escrever hoje
                  </Button>
                }
              />
            );
          }
          const visible = list.filter((e) => matchesSearch(search, e.title, e.content));
          if (visible.length === 0)
            return <EmptyState title="Nada encontrado" description="Tente outras palavras." />;
          return (
            <ul className="flex flex-col gap-3">
              {visible.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen({ mode: 'edit', id: e.id });
                    }}
                    className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-surface p-4 text-left shadow-elev-1 hover:border-border-strong"
                  >
                    <span className="text-caption text-fg-subtle">
                      {formatEntryDate(e.local_date)}
                    </span>
                    {e.title && <span className="font-semibold">{e.title}</span>}
                    <span className="line-clamp-3 whitespace-pre-wrap text-body-sm text-fg-muted">
                      {e.content || 'Sem texto.'}
                    </span>
                    {(e.mood !== null || e.energy !== null) && (
                      <span className="flex flex-wrap gap-1.5">
                        {e.mood !== null && <Badge>Humor: {SCALE[e.mood]}</Badge>}
                        {e.energy !== null && <Badge>Energia: {SCALE[e.energy]}</Badge>}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryState>
      <Dialog
        open={open !== null && (open.mode === 'new' || editing !== undefined)}
        onClose={() => {
          setOpen(null);
        }}
        title={editing ? formatEntryDate(editing.local_date) : 'Nova entrada'}
        size="lg"
      >
        {open && (
          <EntryForm
            key={editing?.id ?? 'new'}
            entry={editing}
            today={today}
            existingDates={new Set(entries.map((e) => e.local_date))}
            onDone={() => {
              setOpen(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

const schema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Informe a data.' }),
  title: optionalText(200),
  content: z.string().max(100000, { error: 'Texto longo demais.' }),
  mood: optionalInt(1, 5, 'nível'),
  energy: optionalInt(1, 5, 'nível'),
});

function EntryForm({
  entry,
  today,
  existingDates,
  onDone,
}: {
  entry: Entry | undefined;
  today: string;
  existingDates: Set<string>;
  onDone: () => void;
}) {
  const client = useSupabase();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useLifeosMutation({
    affects: ['diary'],
    success: 'Entrada salva.',
    mutationFn: (row: {
      local_date: string;
      title: string | null;
      content: string;
      mood: number | null;
      energy: number | null;
    }) =>
      entry
        ? must(client.from('diary_entries').update(row).eq('id', entry.id).select('*').single())
        : must(client.from('diary_entries').insert(row).select('*').single()),
  });
  const remove = useLifeosMutation({
    affects: ['diary'],
    success: 'Entrada excluída.',
    mutationFn: (id: string) => mustSucceed(client.from('diary_entries').delete().eq('id', id)),
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      localDate: entry?.local_date ?? today,
      title: entry?.title ?? '',
      content: entry?.content ?? '',
      mood: inputValue(entry?.mood),
      energy: inputValue(entry?.energy),
    },
  });
  const pending = isSubmitting || save.isPending;

  const onSubmit = handleSubmit(async (v) => {
    if (v.localDate !== entry?.local_date && existingDates.has(v.localDate)) {
      setError('localDate', {
        message: 'Já existe uma entrada nesse dia — abra-a na lista para continuar.',
      });
      return;
    }
    try {
      await save.mutateAsync({
        local_date: v.localDate,
        title: v.title || null,
        content: v.content,
        mood: v.mood,
        energy: v.energy,
      });
      onDone();
    } catch {
      // Erro exibido no aviso.
    }
  });

  return (
    <form
      noValidate
      aria-label="Entrada do diário"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <TextField
          label="Data"
          type="date"
          max={today}
          error={errors.localDate?.message}
          {...register('localDate')}
        />
        <TextField label="Título (opcional)" error={errors.title?.message} {...register('title')} />
      </div>
      <TextareaField
        label="Texto"
        rows={10}
        error={errors.content?.message}
        {...register('content')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Humor (opcional)" {...register('mood')}>
          <option value="">Não informar</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n} · {SCALE[n]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Energia (opcional)" {...register('energy')}>
          <option value="">Não informar</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n} · {SCALE[n]}
            </option>
          ))}
        </SelectField>
      </div>
      {save.isError && <Notice tone="danger">O texto continua aqui; tente salvar de novo.</Notice>}
      <div className="flex flex-wrap justify-between gap-2">
        {entry ? (
          <Button
            variant="ghost"
            icon={<Trash2 className="size-4" />}
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar entrada'}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir entrada?"
        confirmLabel="Excluir entrada"
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (!entry) return;
          remove.mutate(entry.id, {
            onSuccess: onDone,
            onSettled: () => {
              setConfirmDelete(false);
            },
          });
        }}
      >
        A exclusão é permanente e não há cópia em outro lugar.
      </ConfirmDialog>
    </form>
  );
}
