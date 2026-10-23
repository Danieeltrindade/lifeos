import type { FakeDb, Row } from './fake-db';

/**
 * Versões SIMPLIFICADAS das RPCs de domínio para os testes de interface. As regras reais
 * (e seus casos-limite) são testadas no banco com pgTAP; aqui só o efeito visível importa.
 */
export function dbError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export function installDomainRpcs(db: FakeDb) {
  db.onRpc('complete_task', (args) => {
    const rows = db.rows('tasks');
    if (args.p_include_subtasks) {
      for (const r of rows) {
        if (
          r.parent_task_id === args.p_task_id &&
          (r.status === 'todo' || r.status === 'in_progress')
        ) {
          r.status = 'done';
          r.completed_at = new Date().toISOString();
        }
      }
    }
    const task = rows.find((r) => r.id === args.p_task_id);
    if (!task) throw dbError('P0002', 'Tarefa não encontrada');
    const open = rows.some(
      (r) => r.parent_task_id === task.id && (r.status === 'todo' || r.status === 'in_progress'),
    );
    if (open) {
      throw dbError('23514', 'Há subtarefas abertas; conclua-as ou use "concluir com subtarefas"');
    }
    task.status = 'done';
    task.completed_at = new Date().toISOString();
    return { ...task };
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

export function installStudyRpcs(db: FakeDb) {
  db.onRpc('study_time_by_subject', () => []);
  db.onRpc('start_focus_session', (args) => {
    if (db.rows('focus_sessions').some((s) => s.status === 'active')) {
      throw dbError('23505', 'Já existe uma sessão de foco ativa');
    }
    const [row] = db.seed('focus_sessions', [
      {
        subject_id: args.p_subject_id ?? null,
        topic_id: args.p_topic_id ?? null,
        task_id: null,
        status: 'active',
        started_at: nowIso(),
        ended_at: null,
        planned_seconds: args.p_planned_seconds ?? null,
        technique: args.p_technique ?? 'free',
        note: '',
      },
    ]);
    return row;
  });
  db.onRpc('pause_focus_session', (args) => {
    const [row] = db.seed('session_pauses', [
      { session_id: args.p_session_id, started_at: nowIso(), ended_at: null },
    ]);
    return row;
  });
  db.onRpc('resume_focus_session', (args) => {
    const open = db
      .rows('session_pauses')
      .find((p) => p.session_id === args.p_session_id && p.ended_at === null);
    if (!open) throw dbError('23514', 'A sessão não está pausada');
    open.ended_at = nowIso();
    return open;
  });
  db.onRpc('complete_focus_session', (args) => {
    const session = db.rows('focus_sessions').find((s) => s.id === args.p_session_id);
    if (!session) throw dbError('P0002', 'Sessão não encontrada');
    session.status = 'completed';
    session.ended_at = nowIso();
    const seconds = Math.max(
      0,
      Math.floor(
        (Date.parse(String(session.ended_at)) - Date.parse(String(session.started_at))) / 1000,
      ),
    );
    const [activity] = db.seed('activities', [
      {
        title: 'Sessão de foco',
        kind: 'study',
        source: 'timer',
        session_id: session.id,
        subject_id: session.subject_id,
        topic_id: session.topic_id,
        started_at: session.started_at,
        ended_at: session.ended_at,
        duration_seconds: seconds,
      },
    ]);
    return activity;
  });
  db.onRpc('discard_focus_session', (args) => {
    const session = db.rows('focus_sessions').find((s) => s.id === args.p_session_id);
    if (!session) throw dbError('P0002', 'Sessão não encontrada');
    session.status = 'discarded';
    session.ended_at = nowIso();
    return session;
  });
  db.onRpc('save_session_reflection', (args) => {
    const [row] = db.seed('session_reflections', [
      {
        session_id: args.p_session_id,
        studied: args.p_studied ?? '',
        understood: args.p_understood ?? '',
        confusing: args.p_confusing ?? '',
        questions_count: args.p_questions_count ?? 0,
        correct_count: args.p_correct_count ?? 0,
        perceived_difficulty: args.p_perceived_difficulty ?? null,
        next_action: args.p_next_action ?? '',
        suggested_review_on: args.p_suggested_review_on ?? null,
      },
    ]);
    return row;
  });
  db.onRpc('complete_review', (args) => {
    const card = db.rows('review_cards').find((c) => c.id === args.p_card_id);
    if (!card) throw dbError('P0002', 'Revisão não encontrada');
    db.seed('review_attempts', [
      {
        review_card_id: card.id,
        grade: args.p_grade,
        reviewed_at: nowIso(),
        notes: args.p_notes ?? '',
      },
    ]);
    card.repetitions = Number(card.repetitions) + 1;
    return card;
  });
  db.onRpc('postpone_review', (args) => {
    const card = db.rows('review_cards').find((c) => c.id === args.p_card_id);
    if (!card) throw dbError('P0002', 'Revisão não encontrada');
    return card;
  });
}

export function taskRow(overrides: Row = {}): Row {
  return {
    project_id: null,
    parent_task_id: null,
    title: 'Tarefa',
    notes: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_on: null,
    start_on: null,
    estimate_minutes: null,
    sort_order: 0,
    category_id: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fase 4: estatísticas, tempo por tarefa e sincronização de recomendações
// (versões simplificadas; as regras reais são testadas no banco, 06_phase4_rules)
// ---------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo';

function localDay(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 10);
}

function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to;) {
    out.push(d);
    const [y = 1970, m = 1, dd = 1] = d.split('-').map(Number);
    d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  }
  return out;
}

export function installAnalyticsRpcs(db: FakeDb) {
  const inRange = (iso: unknown, from: string, to: string) =>
    typeof iso === 'string' && localDay(iso) >= from && localDay(iso) < to;

  db.onRpc('stats_study', (a) => {
    const from = String(a.p_from);
    const to = String(a.p_to);
    const acts = db
      .rows('activities')
      .filter((r) => r.kind === 'study' && inRange(r.started_at, from, to));
    const days = daysOf(from, to).map((date) => ({
      date,
      seconds: acts
        .filter((r) => localDay(String(r.started_at)) === date)
        .reduce((s, r) => s + Number(r.duration_seconds), 0),
      sessions: acts.filter((r) => r.session_id && localDay(String(r.started_at)) === date).length,
    }));
    const total = acts.reduce((s, r) => s + Number(r.duration_seconds), 0);
    const timer = acts
      .filter((r) => r.session_id)
      .reduce((s, r) => s + Number(r.duration_seconds), 0);
    const subjects = [...new Set(acts.map((r) => (r.subject_id as string | null) ?? null))];
    return {
      from,
      to,
      today: from,
      timezone: TZ,
      days,
      bySubject: subjects.map((id) => ({
        subjectId: id,
        seconds: acts
          .filter((r) => (r.subject_id ?? null) === id)
          .reduce((s, r) => s + Number(r.duration_seconds), 0),
        sessions: acts.filter((r) => (r.subject_id ?? null) === id && r.session_id).length,
      })),
      byTopic: [],
      totals: { seconds: total, timerSeconds: timer, manualSeconds: total - timer },
      sessions: {
        count: acts.filter((r) => r.session_id).length,
        netSeconds: timer,
        grossSeconds: timer,
        discardedZero: 0,
      },
      questions: { questions: 0, correct: 0, sessionsWithQuestions: 0 },
      reviews: {
        attempts: 0,
        byGrade: { '1': 0, '2': 0, '3': 0, '4': 0 },
        postponed: 0,
        activeCards: 0,
        overdueNow: 0,
        dueTodayNow: 0,
      },
    };
  });

  db.onRpc('stats_activities', (a) => {
    const from = String(a.p_from);
    const to = String(a.p_to);
    const acts = db.rows('activities').filter((r) => inRange(r.started_at, from, to));
    const sum = (list: Row[]) => list.reduce((s, r) => s + Number(r.duration_seconds), 0);
    const kinds = [...new Set(acts.map((r) => String(r.kind)))];
    const cats = [...new Set(acts.map((r) => (r.category_id as string | null) ?? null))];
    const reading = acts.filter((r) => r.kind === 'reading');
    const exercise = acts.filter((r) => r.kind === 'exercise');
    return {
      from,
      to,
      days: daysOf(from, to).map((date) => {
        const list = acts.filter((r) => localDay(String(r.started_at)) === date);
        return { date, seconds: sum(list), count: list.length };
      }),
      byKind: kinds.map((kind) => {
        const list = acts.filter((r) => r.kind === kind);
        return { kind, seconds: sum(list), count: list.length };
      }),
      byCategory: cats.map((categoryId) => {
        const list = acts.filter((r) => (r.category_id ?? null) === categoryId);
        return { categoryId, seconds: sum(list), count: list.length };
      }),
      totals: { seconds: sum(acts), count: acts.length },
      reading: {
        count: reading.length,
        pages: reading.reduce((s, r) => s + Number(r.pages ?? 0), 0),
        withPages: reading.filter((r) => r.pages !== null).length,
        titles: new Set(reading.map((r) => r.reading_title).filter(Boolean)).size,
      },
      exercise: {
        count: exercise.length,
        distanceKm: exercise.reduce((s, r) => s + Number(r.distance_km ?? 0), 0),
        withDistance: exercise.filter((r) => r.distance_km !== null).length,
      },
    };
  });

  db.onRpc('stats_tasks', (a) => {
    const from = String(a.p_from);
    const to = String(a.p_to);
    const today = localDay(new Date().toISOString());
    const tasks = db.rows('tasks');
    const doneIn = tasks.filter((t) => t.status === 'done' && inRange(t.completed_at, from, to));
    const due = tasks.filter(
      (t) => typeof t.due_on === 'string' && t.due_on >= from && t.due_on < to,
    );
    const open = (t: Row) => t.status === 'todo' || t.status === 'in_progress';
    const actual = (id: unknown) =>
      db
        .rows('activities')
        .filter((r) => r.task_id === id)
        .reduce((s, r) => s + Number(r.duration_seconds), 0);
    return {
      from,
      to,
      today,
      created: tasks.filter((t) => inRange(t.created_at, from, to)).length,
      completed: doneIn.length,
      cancelled: tasks.filter((t) => t.status === 'cancelled' && inRange(t.cancelled_at, from, to))
        .length,
      due: {
        total: due.length,
        cancelled: due.filter((t) => t.status === 'cancelled').length,
        doneOnTime: due.filter(
          (t) => t.status === 'done' && localDay(String(t.completed_at)) <= String(t.due_on),
        ).length,
        doneLate: due.filter(
          (t) => t.status === 'done' && localDay(String(t.completed_at)) > String(t.due_on),
        ).length,
        open: due.filter(open).length,
        openOverdue: due.filter((t) => open(t) && String(t.due_on) < today).length,
      },
      openNow: tasks.filter(open).length,
      overdueNow: tasks.filter((t) => open(t) && typeof t.due_on === 'string' && t.due_on < today)
        .length,
      days: daysOf(from, to).map((date) => ({
        date,
        completed: doneIn.filter((t) => localDay(String(t.completed_at)) === date).length,
        created: tasks.filter(
          (t) => typeof t.created_at === 'string' && localDay(t.created_at) === date,
        ).length,
      })),
      estimates: doneIn
        .filter((t) => t.estimate_minutes !== null)
        .map((t) => ({
          taskId: t.id,
          estimateMinutes: t.estimate_minutes,
          actualSeconds: actual(t.id),
        })),
      projects: [],
      milestones: [],
    };
  });

  db.onRpc('stats_goals', (a) => ({ from: a.p_from, to: a.p_to, today: a.p_from, goals: [] }));
  db.onRpc('goal_progress', () => []);

  db.onRpc('task_time_totals', (a) => {
    const ids = (a.p_task_ids as string[] | undefined) ?? [];
    return ids
      .map((id) => {
        const list = db.rows('activities').filter((r) => r.task_id === id);
        return {
          task_id: id,
          seconds: list.reduce((s, r) => s + Number(r.duration_seconds), 0),
          activities: list.length,
        };
      })
      .filter((r) => r.activities > 0);
  });

  /** Mesma semântica do banco: deduplica por (regra, escopo), espera após rejeitar e encerra. */
  db.onRpc('sync_recommendations', (a) => {
    const candidates = (a.p_candidates as Row[] | undefined) ?? [];
    const rules = (a.p_rules as string[] | undefined) ?? [];
    const rows = db.rows('recommendations');
    const now = Date.now();
    const isOpen = (r: Row) =>
      r.status === 'pending' || r.status === 'snoozed' || r.status === 'accepted';
    const result = {
      created: 0,
      updated: 0,
      skippedCooldown: 0,
      skippedExpired: 0,
      closed: 0,
      expired: 0,
      reopened: 0,
    };
    for (const c of candidates) {
      if (!rules.includes(String(c.ruleId)))
        throw dbError('22023', 'Candidata de regra não avaliada');
      const same = (r: Row) => r.rule_id === c.ruleId && r.dedup_key === c.dedupKey;
      const open = rows.find((r) => same(r) && isOpen(r));
      if (open) {
        Object.assign(open, {
          title: c.title,
          rationale: c.rationale,
          evidence: c.evidence,
          priority: c.priority,
          action: c.action,
        });
        result.updated += 1;
        continue;
      }
      const cooldown = Number(c.cooldownDays ?? 3) * 86_400_000;
      if (
        rows.some(
          (r) =>
            same(r) &&
            (r.close_reason === 'dismissed' || r.close_reason === 'user_resolved') &&
            now - Date.parse(String(r.closed_at)) < cooldown,
        )
      ) {
        result.skippedCooldown += 1;
        continue;
      }
      db.seed('recommendations', [
        {
          rule_id: c.ruleId,
          dedup_key: c.dedupKey,
          title: c.title,
          rationale: c.rationale,
          evidence: c.evidence ?? {},
          priority: c.priority ?? 2,
          action: c.action ?? null,
          expires_at: c.expiresAt ?? null,
          generated_at: new Date().toISOString(),
        },
      ]);
      result.created += 1;
    }
    for (const r of rows) {
      if (!isOpen(r) || !rules.includes(String(r.rule_id))) continue;
      if (!candidates.some((c) => c.ruleId === r.rule_id && c.dedupKey === r.dedup_key)) {
        Object.assign(r, {
          status: 'resolved',
          close_reason: 'condition_cleared',
          closed_at: new Date().toISOString(),
        });
        result.closed += 1;
      }
    }
    return result;
  });
}
