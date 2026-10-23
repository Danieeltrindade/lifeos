import { useQuery } from '@tanstack/react-query';
import { useLifeosMutation } from '@/lib/query/mutations';
import { qk } from '@/services/data/queries';
import type { Tables, TablesInsert, TablesUpdate } from '@/services/supabase/database.types';
import { must, mustList, mustSucceed, insertOnce } from '@/services/supabase/result';
import { useSupabase } from '@/services/supabase/supabase-context';

export type Session = Tables<'focus_sessions'>;
export type Pause = Tables<'session_pauses'>;
export type Reflection = Tables<'session_reflections'>;
export type ReviewCard = Tables<'review_cards'>;
export type MasteryEvent = Tables<'topic_mastery_events'>;

/** Tempo de estudo por matéria em [from, to) — calculado no banco (pausas descontadas). */
export function useStudyTimeQuery(from: string, to: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: ['sessions', 'time', from, to],
    queryFn: ({ signal }) =>
      mustList(client.rpc('study_time_by_subject', { p_from: from, p_to: to }).abortSignal(signal)),
  });
}

/** Sessão ativa (no máximo uma por usuário — regra do banco) e suas pausas. */
export function useActiveSessionQuery() {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.activeSession,
    // O cronômetro é derivado dos instantes; recarregar de tempos em tempos só sincroniza
    // mudanças feitas em outro dispositivo.
    refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const sessions = await mustList(
        client
          .from('focus_sessions')
          .select('*')
          .eq('status', 'active')
          .limit(1)
          .abortSignal(signal),
      );
      const session = sessions[0];
      if (!session) return null;
      const pauses = await mustList(
        client
          .from('session_pauses')
          .select('*')
          .eq('session_id', session.id)
          .order('started_at', { ascending: true })
          .abortSignal(signal),
      );
      return { session, pauses };
    },
  });
}

export interface SessionWithDetails {
  session: Session;
  durationSeconds: number;
  reflection: Reflection | null;
}

/** Sessões encerradas recentes com duração líquida (da atividade gerada) e reflexão. */
export function useRecentSessionsQuery(limit = 40) {
  const client = useSupabase();
  return useQuery({
    queryKey: ['sessions', 'recent', limit],
    queryFn: async ({ signal }): Promise<SessionWithDetails[]> => {
      const sessions = await mustList(
        client
          .from('focus_sessions')
          .select('*')
          .eq('status', 'completed')
          .order('started_at', { ascending: false })
          .limit(limit)
          .abortSignal(signal),
      );
      if (sessions.length === 0) return [];
      const ids = sessions.map((s) => s.id);
      const [activities, reflections] = await Promise.all([
        mustList(
          client
            .from('activities')
            .select('session_id, duration_seconds')
            .in('session_id', ids)
            .abortSignal(signal),
        ),
        mustList(
          client.from('session_reflections').select('*').in('session_id', ids).abortSignal(signal),
        ),
      ]);
      const duration = new Map(activities.map((a) => [a.session_id, a.duration_seconds]));
      const reflectionBySession = new Map(reflections.map((r) => [r.session_id, r]));
      return sessions.map((session) => ({
        session,
        durationSeconds: duration.get(session.id) ?? 0,
        reflection: reflectionBySession.get(session.id) ?? null,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// Matérias e tópicos
// ---------------------------------------------------------------------------
export function useSaveSubject() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['subjects'],
    success: 'Matéria salva.',
    mutationFn: ({ id, row }: { id?: string; row: TablesUpdate<'subjects'> & { name: string } }) =>
      id
        ? must(client.from('subjects').update(row).eq('id', id).select('*').single())
        : insertOnce(
            row.id,
            () => client.from('subjects').insert(row).select('*').single(),
            () =>
              client
                .from('subjects')
                .select('*')
                .eq('id', row.id ?? '')
                .maybeSingle(),
          ),
  });
}

export function useArchiveSubject() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['subjects'],
    success: (_d, v: { id: string; archived: boolean }) =>
      v.archived ? 'Matéria arquivada.' : 'Matéria restaurada.',
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      mustSucceed(
        client
          .from('subjects')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('id', id),
      ),
  });
}

export function useDeleteSubject() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['subjects'],
    success: 'Matéria excluída.',
    mutationFn: (id: string) => mustSucceed(client.from('subjects').delete().eq('id', id)),
  });
}

export function useSaveTopic() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['subjects'],
    success: 'Tópico salvo.',
    mutationFn: ({ id, row }: { id?: string; row: TablesInsert<'topics'> }) =>
      id
        ? must(client.from('topics').update(row).eq('id', id).select('*').single())
        : insertOnce(
            row.id,
            () => client.from('topics').insert(row).select('*').single(),
            () =>
              client
                .from('topics')
                .select('*')
                .eq('id', row.id ?? '')
                .maybeSingle(),
          ),
  });
}

export function useDeleteTopic() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['subjects'],
    success: 'Tópico excluído.',
    mutationFn: (id: string) => mustSucceed(client.from('topics').delete().eq('id', id)),
  });
}

/** Ajuste MANUAL de domínio: sempre um novo registro identificado como manual. */
export function useRecordMastery() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['subjects'],
    success: 'Domínio registrado.',
    mutationFn: (input: { topic_id: string; level: number; note: string }) =>
      mustSucceed(client.from('topic_mastery_events').insert({ ...input, source: 'manual' })),
  });
}

// ---------------------------------------------------------------------------
// Cronômetro
// ---------------------------------------------------------------------------
export function useStartSession() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['sessions'],
    success: 'Sessão iniciada.',
    mutationFn: (args: {
      p_subject_id?: string;
      p_topic_id?: string;
      p_task_id?: string;
      p_planned_seconds?: number;
      p_technique: string;
    }) => must(client.rpc('start_focus_session', args).single()),
  });
}

export function useSessionControl() {
  const client = useSupabase();
  const pause = useLifeosMutation({
    affects: ['sessions'],
    mutationFn: (id: string) =>
      mustSucceed(client.rpc('pause_focus_session', { p_session_id: id })),
  });
  const resume = useLifeosMutation({
    affects: ['sessions'],
    mutationFn: (id: string) =>
      mustSucceed(client.rpc('resume_focus_session', { p_session_id: id })),
  });
  const complete = useLifeosMutation({
    affects: ['sessions'],
    success: 'Sessão encerrada e registrada.',
    mutationFn: (id: string) =>
      must(client.rpc('complete_focus_session', { p_session_id: id }).single()),
  });
  const completeAt = useLifeosMutation({
    affects: ['sessions'],
    success: 'Sessão encerrada no horário escolhido.',
    mutationFn: ({ id, endedAt }: { id: string; endedAt: string }) =>
      must(
        client.rpc('complete_focus_session_at', { p_session_id: id, p_ended_at: endedAt }).single(),
      ),
  });
  const discard = useLifeosMutation({
    affects: ['sessions'],
    success: 'Sessão descartada (nada foi registrado).',
    mutationFn: (id: string) =>
      mustSucceed(client.rpc('discard_focus_session', { p_session_id: id })),
  });
  return { pause, resume, complete, completeAt, discard };
}

/** Registro manual: sessão já encerrada (o banco cria a atividade e valida horários). */
export function useCreateManualSession() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['sessions'],
    success: 'Sessão registrada.',
    mutationFn: (row: TablesInsert<'focus_sessions'>) =>
      insertOnce(
        row.id,
        () =>
          client
            .from('focus_sessions')
            .insert({ ...row, status: 'completed' })
            .select('*')
            .single(),
        () =>
          client
            .from('focus_sessions')
            .select('*')
            .eq('id', row.id ?? '')
            .maybeSingle(),
      ),
  });
}

export function useCorrectSession() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['sessions'],
    success: 'Sessão corrigida.',
    mutationFn: async (args: {
      id: string;
      startedAt: string;
      endedAt: string;
      patch: TablesUpdate<'focus_sessions'>;
    }) => {
      await mustSucceed(client.from('focus_sessions').update(args.patch).eq('id', args.id));
      await mustSucceed(
        client.rpc('correct_focus_session', {
          p_session_id: args.id,
          p_started_at: args.startedAt,
          p_ended_at: args.endedAt,
        }),
      );
    },
  });
}

export function useDeleteSession() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['sessions'],
    success: 'Sessão excluída (a atividade correspondente também).',
    mutationFn: (id: string) => mustSucceed(client.from('focus_sessions').delete().eq('id', id)),
  });
}

export function useSaveReflection() {
  const client = useSupabase();
  return useLifeosMutation({
    affects: ['sessions', 'reviews', 'subjects'],
    success: 'Reflexão salva.',
    mutationFn: (args: {
      p_session_id: string;
      p_studied: string;
      p_understood: string;
      p_confusing: string;
      p_questions_count: number;
      p_correct_count: number;
      p_perceived_difficulty?: number;
      p_next_action: string;
      p_suggested_review_on?: string;
    }) => mustSucceed(client.rpc('save_session_reflection', args)),
  });
}

// ---------------------------------------------------------------------------
// Revisões
// ---------------------------------------------------------------------------
export function useReviewDetailQuery(cardId: string) {
  const client = useSupabase();
  return useQuery({
    queryKey: qk.reviewDetail(cardId),
    queryFn: async ({ signal }) => {
      const [attempts, log] = await Promise.all([
        mustList(
          client
            .from('review_attempts')
            .select('*')
            .eq('review_card_id', cardId)
            .order('reviewed_at', { ascending: false })
            .abortSignal(signal),
        ),
        mustList(
          client
            .from('review_schedule_log')
            .select('*')
            .eq('review_card_id', cardId)
            .order('changed_at', { ascending: false })
            .abortSignal(signal),
        ),
      ]);
      return { attempts, log };
    },
  });
}

export function useReviewActions() {
  const client = useSupabase();
  const complete = useLifeosMutation({
    affects: ['reviews'],
    success: 'Revisão registrada.',
    mutationFn: (args: { p_card_id: string; p_grade: number; p_notes?: string }) =>
      must(client.rpc('complete_review', args).single()),
  });
  const postpone = useLifeosMutation({
    affects: ['reviews'],
    success: 'Revisão adiada.',
    mutationFn: (args: { p_card_id: string; p_days: number }) =>
      must(client.rpc('postpone_review', args).single()),
  });
  const reschedule = useLifeosMutation({
    affects: ['reviews'],
    success: 'Revisão reagendada.',
    mutationFn: (args: { p_card_id: string; p_due_on: string }) =>
      must(client.rpc('reschedule_review', args).single()),
  });
  const create = useLifeosMutation({
    affects: ['reviews'],
    success: 'Revisão agendada.',
    mutationFn: (row: { topic_id: string; due_on: string; priority: string }) =>
      mustSucceed(client.from('review_cards').insert(row)),
  });
  const setStatus = useLifeosMutation({
    affects: ['reviews'],
    success: (_d, v: { id: string; status: 'active' | 'suspended' }) =>
      v.status === 'active' ? 'Revisão reativada.' : 'Revisão suspensa.',
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      mustSucceed(client.from('review_cards').update({ status }).eq('id', id)),
  });
  const setPriority = useLifeosMutation({
    affects: ['reviews'],
    mutationFn: ({ id, priority }: { id: string; priority: string }) =>
      mustSucceed(client.from('review_cards').update({ priority }).eq('id', id)),
  });
  const remove = useLifeosMutation({
    affects: ['reviews'],
    success: 'Revisão excluída (com o histórico de tentativas).',
    mutationFn: (id: string) => mustSucceed(client.from('review_cards').delete().eq('id', id)),
  });
  return { complete, postpone, reschedule, create, setStatus, setPriority, remove };
}
