import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { fromLocalInput, toLocalInput } from '@/lib/zoned';
import { useEventMutations } from '../data/calendar-api';
import type { CalendarEvent } from '../logic/calendar-items';
import type { Occurrence } from '../logic/recurrence';

/**
 * Altera UMA ocorrência de uma série (exceção "modificada", identificada pelo início
 * original). A série e as demais ocorrências não mudam.
 */
export function OccurrenceForm({
  event,
  occurrence,
  timezone,
  onSaved,
  onCancel,
}: {
  event: CalendarEvent;
  occurrence: Occurrence;
  timezone: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { exception } = useEventMutations();
  const [title, setTitle] = useState(occurrence.title ?? event.title);
  const [start, setStart] = useState(
    occurrence.allDay ? '' : toLocalInput(occurrence.start, timezone),
  );
  const [end, setEnd] = useState(occurrence.allDay ? '' : toLocalInput(occurrence.end, timezone));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      aria-label="Ocorrência"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (t.length === 0 || t.length > 200) {
          setError('Informe um título de até 200 caracteres.');
          return;
        }
        let newStart: string | null = null;
        let newEnd: string | null = null;
        if (!occurrence.allDay) {
          newStart = fromLocalInput(start, timezone);
          newEnd = fromLocalInput(end, timezone);
          if (!newStart || !newEnd || Date.parse(newEnd) <= Date.parse(newStart)) {
            setError('O fim precisa ser depois do início.');
            return;
          }
        }
        setError(null);
        exception.mutate(
          {
            event_id: event.id,
            kind: 'modified',
            original_starts_at: occurrence.allDay ? null : occurrence.key,
            original_date: occurrence.allDay ? occurrence.key : null,
            new_title: t === event.title ? null : t,
            new_starts_at: newStart,
            new_ends_at: newEnd,
          },
          { onSuccess: onSaved },
        );
      }}
    >
      <p className="text-body-sm text-fg-muted">
        Só esta ocorrência muda; a série e as outras datas continuam iguais.
      </p>
      <TextField
        label="Título"
        value={title}
        maxLength={200}
        onChange={(e) => {
          setTitle(e.target.value);
        }}
      />
      {!occurrence.allDay && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Início"
            type="datetime-local"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
            }}
          />
          <TextField
            label="Fim"
            type="datetime-local"
            hint={`Fuso ${timezone}.`}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
            }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-body-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={exception.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={exception.isPending}>
          {exception.isPending ? 'Salvando…' : 'Salvar só esta ocorrência'}
        </Button>
      </div>
    </form>
  );
}
