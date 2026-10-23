import { useLifeosMutation } from '@/lib/query/mutations';
import type { Tables, TablesUpdate } from '@/services/supabase/database.types';
import { mustSucceed, insertOnce } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';

export type Habit = Tables<'habits'>;
export type HabitCheckin = Tables<'habit_checkins'>;

export function useSaveHabit() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['habits'],
    success: 'Hábito salvo.',
    mutationFn: ({ id, row }: { id?: string; row: TablesUpdate<'habits'> & { name: string } }) =>
      id
        ? mustSucceed(client.from('habits').update(row).eq('id', id))
        : insertOnce(
            row.id,
            () => client.from('habits').insert(row).select('*').single(),
            () =>
              client
                .from('habits')
                .select('*')
                .eq('id', row.id ?? '')
                .maybeSingle(),
          ).then(() => undefined),
  });
}

export function useDeleteHabit() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['habits', 'calendar'],
    success: 'Hábito excluído.',
    mutationFn: (id: string) => mustSucceed(client.from('habits').delete().eq('id', id)),
  });
}

/**
 * Marcar/corrigir/desfazer um dia. Uma marcação por hábito e dia (restrição do banco): se
 * já existe, o valor é CORRIGIDO; desfazer apaga a marcação — nada de registros conflitantes.
 */
export function useCheckin() {
  const client = useSupabase();
  const set = useLifeosMutation({
    affects: ['habits'],
    mutationFn: ({
      habitId,
      date,
      value,
      existing,
    }: {
      habitId: string;
      date: string;
      value: number | null;
      existing: HabitCheckin | undefined;
    }) =>
      existing
        ? mustSucceed(client.from('habit_checkins').update({ value }).eq('id', existing.id))
        : // Marcar é idempotente: se a resposta se perdeu e a marcação do dia já existe, deu certo.
          insertOnce(
            date,
            () =>
              client
                .from('habit_checkins')
                .insert({ habit_id: habitId, local_date: date, value })
                .select('id')
                .single(),
            () =>
              client
                .from('habit_checkins')
                .select('id')
                .eq('habit_id', habitId)
                .eq('local_date', date)
                .maybeSingle(),
          ).then(() => undefined),
  });
  const undo = useLifeosMutation({
    affects: ['habits'],
    success: 'Marcação desfeita.',
    mutationFn: (checkinId: string) =>
      mustSucceed(client.from('habit_checkins').delete().eq('id', checkinId)),
  });
  return { set, undo };
}

export function toRule(h: Habit) {
  return {
    scheduleKind: h.schedule_kind as 'daily' | 'weekdays' | 'times_per_week',
    weekdays: h.weekdays,
    timesPerWeek: h.times_per_week,
    targetValue: h.target_value,
    startOn: h.start_on,
  };
}

export function toCheckins(list: readonly HabitCheckin[], habitId: string) {
  return list
    .filter((c) => c.habit_id === habitId)
    .map((c) => ({ localDate: c.local_date, value: c.value }));
}
