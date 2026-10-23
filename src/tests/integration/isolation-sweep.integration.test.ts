/**
 * Varredura de isolamento pela API pública: a conta A cria dados em praticamente todas as
 * tabelas (pelos mesmos caminhos do app: inserts e funções RPC) e a conta B tenta, em CADA
 * tabela, ler, "roubar" (UPDATE user_id), excluir e gravar em nome de A.
 *
 * Complementa supabase/tests/database/02_rls_isolation (pgTAP, dentro do banco) com o caminho
 * real: Auth → JWT → gateway → PostgREST → RLS. Mesmos requisitos de rls.integration.test.ts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/services/supabase/database.types';

type Client = SupabaseClient<Database>;
// Varre tabelas por nome, sem os tipos de cada uma.
type AnyClient = SupabaseClient;
const env = import.meta.env as unknown as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL ?? '';
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const creds = {
  a: { email: env.LIFEOS_TEST_A_EMAIL ?? '', password: env.LIFEOS_TEST_A_PASSWORD ?? '' },
  b: { email: env.LIFEOS_TEST_B_EMAIL ?? '', password: env.LIFEOS_TEST_B_PASSWORD ?? '' },
};
const configured = Boolean(
  url && key && creds.a.email && creds.a.password && creds.b.email && creds.b.password,
);

async function signIn(c: { email: string; password: string }) {
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword(c);
  if (error) throw new Error(`Login da conta de teste falhou: ${error.code ?? error.message}`);
  return { client, userId: data.user.id };
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error || r.data === null || r.data === undefined) {
    throw new Error(`${what}: ${r.error?.message ?? 'sem dados'}`);
  }
  return r.data;
}

/** Tabelas do schema public e a coluna que identifica o dono. */
const TABLES: [table: string, owner: string][] = [
  ['profiles', 'id'],
  ['planning_preferences', 'user_id'],
  ['availability_windows', 'user_id'],
  ['projects', 'user_id'],
  ['project_milestones', 'user_id'],
  ['project_status_history', 'user_id'],
  ['tasks', 'user_id'],
  ['task_dependencies', 'user_id'],
  ['subjects', 'user_id'],
  ['topics', 'user_id'],
  ['topic_mastery_events', 'user_id'],
  ['learning_notes', 'user_id'],
  ['focus_sessions', 'user_id'],
  ['session_pauses', 'user_id'],
  ['session_reflections', 'user_id'],
  ['review_cards', 'user_id'],
  ['review_attempts', 'user_id'],
  ['review_schedule_log', 'user_id'],
  ['activity_categories', 'user_id'],
  ['activities', 'user_id'],
  ['habits', 'user_id'],
  ['habit_checkins', 'user_id'],
  ['goals', 'user_id'],
  ['goal_progress_entries', 'user_id'],
  ['goal_changes', 'user_id'],
  ['goal_milestones', 'user_id'],
  ['diary_entries', 'user_id'],
  ['calendar_events', 'user_id'],
  ['calendar_event_exceptions', 'user_id'],
  ['recommendations', 'user_id'],
  ['reminders', 'user_id'],
  ['weekly_reviews', 'user_id'],
  ['weekly_review_priorities', 'user_id'],
];

describe.runIf(configured)('Supabase real: varredura de isolamento em todas as tabelas', () => {
  let a: { client: Client; userId: string };
  let b: { client: Client; userId: string };
  const counts = new Map<string, number>();
  const tag = `sweep-${Date.now().toString(36)}`;

  async function countOf(client: AnyClient, table: string, owner: string, userId: string) {
    const r = await client
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(owner, userId);
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    return r.count ?? 0;
  }

  beforeAll(async () => {
    a = await signIn(creds.a);
    b = await signIn(creds.b);
    const c = a.client;
    const today = new Date().toISOString().slice(0, 10);

    // Estudos: matéria → tópico → revisão → tentativa/reagendamento; sessão com pausa e reflexão.
    const subject = must(
      await c
        .from('subjects')
        .insert({ name: `Matéria ${tag}` })
        .select()
        .single(),
      'subject',
    );
    const topic = must(
      await c
        .from('topics')
        .insert({ subject_id: subject.id, name: `Tópico ${tag}` })
        .select()
        .single(),
      'topic',
    );
    must(
      await c
        .from('topic_mastery_events')
        .insert({ topic_id: topic.id, level: 2 })
        .select()
        .single(),
      'mastery',
    );
    must(
      await c
        .from('learning_notes')
        .insert({ subject_id: subject.id, title: `Nota ${tag}` })
        .select()
        .single(),
      'note',
    );
    const card = must(
      await c.from('review_cards').insert({ topic_id: topic.id, due_on: today }).select().single(),
      'card',
    );
    must(await c.rpc('postpone_review', { p_card_id: card.id, p_days: 1 }), 'postpone');
    const session = must(
      await c.rpc('start_focus_session', { p_subject_id: subject.id, p_topic_id: topic.id }),
      'start',
    );
    must(await c.rpc('pause_focus_session', { p_session_id: session.id }), 'pause');
    must(await c.rpc('resume_focus_session', { p_session_id: session.id }), 'resume');
    must(await c.rpc('complete_focus_session', { p_session_id: session.id }), 'complete');
    must(
      await c.rpc('save_session_reflection', { p_session_id: session.id, p_studied: tag }),
      'reflection',
    );
    const grade = await c
      .from('review_attempts')
      .insert({ review_card_id: card.id, grade: 3 })
      .select()
      .single();
    if (grade.error) throw new Error(`review_attempts: ${grade.error.message}`);

    // Tarefas e projetos.
    const project = must(
      await c
        .from('projects')
        .insert({ name: `Projeto ${tag}` })
        .select()
        .single(),
      'project',
    );
    must(
      await c
        .from('project_milestones')
        .insert({ project_id: project.id, title: `Marco ${tag}` })
        .select()
        .single(),
      'milestone',
    );
    must(
      await c.from('projects').update({ status: 'on_hold' }).eq('id', project.id).select().single(),
      'project status',
    );
    const t1 = must(
      await c
        .from('tasks')
        .insert({ title: `T1 ${tag}`, project_id: project.id })
        .select()
        .single(),
      't1',
    );
    const t2 = must(
      await c
        .from('tasks')
        .insert({ title: `T2 ${tag}` })
        .select()
        .single(),
      't2',
    );
    must(
      await c
        .from('task_dependencies')
        .insert({ task_id: t2.id, depends_on_task_id: t1.id })
        .select()
        .single(),
      'dep',
    );

    // Metas, hábitos, atividades, diário.
    const goal = must(
      await c
        .from('goals')
        .insert({ title: `Meta ${tag}`, target_value: 5, unit: 'x', progress_mode: 'manual' })
        .select()
        .single(),
      'goal',
    );
    must(
      await c
        .from('goal_progress_entries')
        .insert({ goal_id: goal.id, amount: 1 })
        .select()
        .single(),
      'goal entry',
    );
    must(
      await c
        .from('goal_milestones')
        .insert({ goal_id: goal.id, title: `Etapa ${tag}` })
        .select()
        .single(),
      'goal milestone',
    );
    must(
      await c.from('goals').update({ target_value: 6 }).eq('id', goal.id).select().single(),
      'goal change',
    );
    const habit = must(
      await c
        .from('habits')
        .insert({ name: `Hábito ${tag}` })
        .select()
        .single(),
      'habit',
    );
    must(
      await c
        .from('habit_checkins')
        .insert({ habit_id: habit.id, local_date: today })
        .select()
        .single(),
      'checkin',
    );
    const category = must(
      await c
        .from('activity_categories')
        .insert({ name: `Cat ${tag}` })
        .select()
        .single(),
      'category',
    );
    const start = new Date(Date.now() - 3600_000).toISOString();
    must(
      await c
        .from('activities')
        .insert({
          title: `Atividade ${tag}`,
          category_id: category.id,
          started_at: start,
          ended_at: new Date().toISOString(),
        })
        .select()
        .single(),
      'activity',
    );
    must(
      await c.from('diary_entries').insert({ local_date: today, content: tag }).select().single(),
      'diary',
    );

    // Calendário, planejamento, revisão semanal, lembretes, recomendações.
    const event = must(
      await c
        .from('calendar_events')
        .insert({
          title: `Evento ${tag}`,
          starts_at: start,
          ends_at: new Date().toISOString(),
          recurrence_rule: 'FREQ=DAILY;COUNT=3',
        })
        .select()
        .single(),
      'event',
    );
    must(
      await c
        .from('calendar_event_exceptions')
        .insert({
          event_id: event.id,
          kind: 'cancelled',
          original_starts_at: new Date(Date.parse(start) + 86400_000).toISOString(),
        })
        .select()
        .single(),
      'exception',
    );
    must(
      await c
        .from('availability_windows')
        .insert({ weekday: 1, start_time: '09:00', end_time: '11:00' })
        .select()
        .single(),
      'window',
    );
    const prefs = await c
      .from('planning_preferences')
      .upsert({ user_id: a.userId })
      .select()
      .single();
    if (prefs.error) throw new Error(`planning_preferences: ${prefs.error.message}`);
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const review = must(
      await c
        .from('weekly_reviews')
        .insert({ week_start: monday.toISOString().slice(0, 10) })
        .select()
        .single(),
      'weekly',
    );
    must(
      await c
        .from('weekly_review_priorities')
        .insert({ review_id: review.id, title: `Prioridade ${tag}` })
        .select()
        .single(),
      'priority',
    );
    must(
      await c
        .from('reminders')
        .insert({
          title: `Lembrete ${tag}`,
          remind_at: new Date(Date.now() + 86400_000).toISOString(),
        })
        .select()
        .single(),
      'reminder',
    );
    must(
      await c.rpc('sync_recommendations', {
        p_candidates: [
          {
            ruleId: 'task.overdue',
            dedupKey: tag,
            title: `Rec ${tag}`,
            rationale: 'teste de isolamento',
            priority: 2,
          },
        ],
        p_rules: ['task.overdue'],
      }),
      'sync',
    );

    for (const [table, owner] of TABLES)
      counts.set(table, await countOf(c, table, owner, a.userId));
  });

  afterAll(async () => {
    // A apaga o que criou (as filhas caem em cascata).
    const c = a.client as unknown as AnyClient;
    for (const t of [
      'tasks',
      'projects',
      'subjects',
      'goals',
      'habits',
      'activities',
      'activity_categories',
      'diary_entries',
      'calendar_events',
      'availability_windows',
      'weekly_reviews',
      'reminders',
      'recommendations',
      'focus_sessions',
    ]) {
      await c.from(t).delete().eq('user_id', a.userId);
    }
    await a.client.auth.signOut();
    await b.client.auth.signOut();
  });

  it('A tem dados em todas as tabelas (a varredura não testa tabelas vazias)', () => {
    const empty = TABLES.filter(([t]) => (counts.get(t) ?? 0) === 0).map(([t]) => t);
    expect(empty).toEqual([]);
  });

  it.each(TABLES)(
    '%s: B não lê, não toma posse, não exclui nem grava em nome de A',
    async (table, owner) => {
      const bc = b.client as unknown as AnyClient;
      const read = await bc.from(table).select('*').eq(owner, a.userId);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);

      const steal = await bc
        .from(table)
        .update({ [owner]: b.userId })
        .eq(owner, a.userId)
        .select();
      expect(steal.data ?? []).toEqual([]);

      const del = await bc.from(table).delete().eq(owner, a.userId).select();
      expect(del.data ?? []).toEqual([]);

      if (table !== 'profiles') {
        const forge = await bc.from(table).insert({ user_id: a.userId });
        expect(forge.error).not.toBeNull();
      }

      expect(await countOf(a.client as unknown as AnyClient, table, owner, a.userId)).toBe(
        counts.get(table),
      );
    },
  );

  it('funções de estatística e exportação de B não contêm nada de A', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    for (const fn of ['stats_study', 'stats_tasks', 'stats_activities', 'stats_goals'] as const) {
      const r = await b.client.rpc(fn, { p_from: from, p_to: today });
      expect(r.error).toBeNull();
      expect(JSON.stringify(r.data)).not.toContain(tag);
    }
    const exported = await b.client.rpc('export_my_data');
    expect(JSON.stringify(exported.data)).not.toContain(tag);
    expect(JSON.stringify(exported.data)).not.toContain(a.userId);
  });
});
