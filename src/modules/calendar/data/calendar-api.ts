import { useQuery } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import { qk } from '@/services/data/queries';
import type { TablesInsert, TablesUpdate } from '@/services/supabase/database.types';
import { fetchAll, must, mustSucceed, insertOnce } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';

/**
 * Eventos que podem aparecer em [from, to): com horário que se sobrepõe, de dia inteiro que
 * se sobrepõe e TODAS as séries recorrentes (expandidas na interface, só na janela).
 */
export function useCalendarRangeQuery(from: string, to: string, fromDate: string, toDate: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.calendar(from, to),
    queryFn: async ({ signal }) => {
      const [timed, allDay, recurring] = await Promise.all([
        fetchAll((lo, hi) =>
          client
            .from('calendar_events')
            .select('*')
            .is('recurrence_rule', null)
            .eq('all_day', false)
            .lt('starts_at', to)
            .gt('ends_at', from)
            .order('id', { ascending: true })
            .range(lo, hi)
            .abortSignal(signal),
        ),
        fetchAll((lo, hi) =>
          client
            .from('calendar_events')
            .select('*')
            .is('recurrence_rule', null)
            .eq('all_day', true)
            .lt('start_date', toDate)
            .gt('end_date', fromDate)
            .order('id', { ascending: true })
            .range(lo, hi)
            .abortSignal(signal),
        ),
        fetchAll((lo, hi) =>
          client
            .from('calendar_events')
            .select('*')
            .not('recurrence_rule', 'is', null)
            .order('id', { ascending: true })
            .range(lo, hi)
            .abortSignal(signal),
        ),
      ]);
      const ids = recurring.map((e) => e.id);
      const exceptions =
        ids.length === 0
          ? []
          : await fetchAll((lo, hi) =>
              client
                .from('calendar_event_exceptions')
                .select('*')
                .in('event_id', ids)
                .order('id', { ascending: true })
                .range(lo, hi)
                .abortSignal(signal),
            );
      // Um evento aparece numa só das três leituras; o Map garante isso mesmo assim.
      const events = [
        ...new Map([...timed, ...allDay, ...recurring].map((e) => [e.id, e])).values(),
      ];
      return { events, exceptions };
    },
  });
}

export type EventInput = Omit<TablesInsert<'calendar_events'>, 'user_id'>;

export function useEventMutations() {
  const client = useSupabase();
  const create = useLifeosMutation({
    affects: ['calendar'],
    success: 'Evento criado.',
    mutationFn: (row: EventInput) =>
      insertOnce(
        row.id,
        () => client.from('calendar_events').insert(row).select('*').single(),
        () =>
          client
            .from('calendar_events')
            .select('*')
            .eq('id', row.id ?? '')
            .maybeSingle(),
      ),
  });
  const update = useLifeosMutation({
    affects: ['calendar'],
    success: 'Evento atualizado.',
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'calendar_events'> }) =>
      must(client.from('calendar_events').update(patch).eq('id', id).select('*').single()),
  });
  const remove = useLifeosMutation({
    affects: ['calendar'],
    success: 'Evento excluído.',
    mutationFn: (id: string) => mustSucceed(client.from('calendar_events').delete().eq('id', id)),
  });
  /** Altera ou cancela UMA ocorrência de uma série (exceção pelo início original). */
  const exception = useLifeosMutation({
    affects: ['calendar'],
    success: (_d, v: TablesInsert<'calendar_event_exceptions'>) =>
      v.kind === 'cancelled' ? 'Ocorrência removida.' : 'Ocorrência alterada.',
    mutationFn: async (row: TablesInsert<'calendar_event_exceptions'>) => {
      // Uma exceção por ocorrência: substitui a anterior, se houver.
      let del = client.from('calendar_event_exceptions').delete().eq('event_id', row.event_id);
      del = row.original_starts_at
        ? del.eq('original_starts_at', row.original_starts_at)
        : del.eq('original_date', row.original_date ?? '');
      await mustSucceed(del);
      await mustSucceed(client.from('calendar_event_exceptions').insert(row));
    },
  });
  return { create, update, remove, exception };
}

/** Vários blocos de uma vez (planejamento aceito pelo usuário). Uma única escrita. */
export function useCreateBlocks() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['calendar'],
    success: (_d, rows: EventInput[]) =>
      rows.length === 1
        ? '1 bloco criado no calendário.'
        : `${String(rows.length)} blocos criados no calendário.`,
    mutationFn: (rows: EventInput[]) => mustSucceed(client.from('calendar_events').insert(rows)),
  });
}

/**
 * "Esta e as seguintes": a série original passa a terminar antes da ocorrência (nova regra)
 * e uma série nova começa nela. Exceções da série original a partir da ocorrência deixam de
 * valer e são removidas (ADR-033).
 */
export interface SplitSeriesVars {
  eventId: string;
  oldRule: string;
  /** Início original (instante) da ocorrência, ou a data (dia inteiro). */
  split: { instant: string } | { date: string };
  /** null = "excluir esta e as seguintes". */
  newRow: EventInput | null;
}

export function useSplitSeries() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['calendar'],
    success: (_d, v: SplitSeriesVars) =>
      v.newRow
        ? 'Esta e as próximas ocorrências foram alteradas.'
        : 'Esta e as próximas ocorrências foram removidas.',
    mutationFn: async ({ eventId, oldRule, split, newRow }: SplitSeriesVars) => {
      await mustSucceed(
        client.from('calendar_events').update({ recurrence_rule: oldRule }).eq('id', eventId),
      );
      let del = client.from('calendar_event_exceptions').delete().eq('event_id', eventId);
      del =
        'instant' in split
          ? del.gte('original_starts_at', split.instant)
          : del.gte('original_date', split.date);
      await mustSucceed(del);
      if (newRow) await mustSucceed(client.from('calendar_events').insert(newRow));
    },
  });
}
