import { useQuery } from '@tanstack/react-query';
import { addDays } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import { mustList } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';
import type { Task } from '@/services/data/queries';
import { expandAgenda } from '@/modules/calendar/logic/agenda';
import { formatPercent, formatSeconds } from '@/modules/analytics/logic/metrics';
import { taskTimePlan } from '../logic/time-plan';

const fmt = (m: number) => formatSeconds(m * 60);

/** Estimado × planejado × realizado da tarefa (leitura; nada é concluído automaticamente). */
export function TaskTimeSection({
  task,
  timezone,
  today,
}: {
  task: Task;
  timezone: string;
  today: string;
}) {
  const client = useSupabase();
  const totals = useQuery({
    queryKey: ['activities', 'task-totals', task.id],
    queryFn: ({ signal }) =>
      mustList(client.rpc('task_time_totals', { p_task_ids: [task.id] }).abortSignal(signal)),
  });
  const blocks = useQuery({
    queryKey: ['calendar', 'task-blocks', task.id],
    queryFn: async ({ signal }) => {
      const events = await mustList(
        client.from('calendar_events').select('*').eq('task_id', task.id).abortSignal(signal),
      );
      const ids = events.filter((e) => e.recurrence_rule).map((e) => e.id);
      const exceptions =
        ids.length === 0
          ? []
          : await mustList(
              client
                .from('calendar_event_exceptions')
                .select('*')
                .in('event_id', ids)
                .abortSignal(signal),
            );
      return { events, exceptions };
    },
  });

  if (totals.status !== 'success' || blocks.status !== 'success') {
    return (
      <p className="text-caption text-fg-subtle" role="status">
        {totals.status === 'error' || blocks.status === 'error'
          ? 'Não foi possível carregar o tempo da tarefa.'
          : 'Carregando tempo planejado e realizado…'}
      </p>
    );
  }
  // Séries recorrentes: ocorrências desde a criação até o prazo (ou 4 semanas à frente).
  const until = task.due_on && task.due_on >= today ? addDays(task.due_on, 1) : addDays(today, 28);
  const slots = expandAgenda(
    blocks.data.events,
    blocks.data.exceptions,
    task.created_at,
    zonedToUtc(until, '00:00', timezone).toISOString(),
    timezone,
  );
  const plan = taskTimePlan({
    estimateMinutes: task.estimate_minutes,
    actualSeconds: totals.data[0]?.seconds ?? 0,
    blocks: slots,
    now: new Date(),
  });
  return (
    <section aria-labelledby={`time-${task.id}`} className="rounded-md border border-border p-4">
      <h3 id={`time-${task.id}`} className="mb-2 text-body-sm font-semibold">
        Tempo: estimado, planejado e realizado
      </h3>
      <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4">
        <div>
          <dt className="text-caption text-fg-subtle">Estimado</dt>
          <dd className="font-semibold">
            {plan.estimatedMinutes === null ? 'Sem estimativa' : fmt(plan.estimatedMinutes)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-subtle">Planejado em blocos</dt>
          <dd className="font-semibold">{fmt(plan.plannedMinutes)}</dd>
          {plan.plannedFutureMinutes > 0 && (
            <dd className="text-caption text-fg-muted">
              {fmt(plan.plannedFutureMinutes)} ainda por vir
            </dd>
          )}
        </div>
        <div>
          <dt className="text-caption text-fg-subtle">Realizado</dt>
          <dd className="font-semibold">{fmt(plan.actualMinutes)}</dd>
        </div>
        <div>
          <dt className="text-caption text-fg-subtle">Realizado − estimado</dt>
          <dd className="font-semibold">
            {plan.diffMinutes === null
              ? '—'
              : `${plan.diffMinutes > 0 ? '+' : plan.diffMinutes < 0 ? '−' : ''}${fmt(Math.abs(plan.diffMinutes))}`}
          </dd>
          {plan.diffRate !== null && (
            <dd className="text-caption text-fg-muted">
              {plan.diffRate > 0 ? 'acima' : plan.diffRate < 0 ? 'abaixo' : 'igual'} da estimativa (
              {formatPercent(Math.abs(plan.diffRate))})
            </dd>
          )}
        </div>
      </dl>
      <p className="mt-2 text-caption text-fg-subtle">
        Realizado = atividades e sessões ligadas à tarefa. Atingir a estimativa não conclui a
        tarefa: concluir é sempre manual.
      </p>
    </section>
  );
}
