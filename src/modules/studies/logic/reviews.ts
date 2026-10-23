/**
 * Regra de revisão espaçada do LifeOS (ADR-025) — espelho da função SQL
 * private.review_next_interval, usado para MOSTRAR ao usuário a próxima data antes de
 * confirmar. Quem decide é o banco; o teste garante que as duas versões coincidem.
 *
 * Escada de intervalos (dias): 1 · 3 · 7 · 14 · 30 · 60 · 120 · 240
 *   nota 1 (errei)  → repetições = 0, revisar amanhã;
 *   nota 2 (difícil)→ repetições mantidas, intervalo do degrau atual;
 *   nota 3 (bom)    → sobe um degrau;
 *   nota 4 (fácil)  → sobe dois degraus.
 *
 * É uma regra SIMPLES e transparente, inspirada na repetição espaçada clássica; não afirmamos
 * que seja melhor que SM-2 ou FSRS — ela é fácil de entender, prever e testar.
 */
export const LADDER = [1, 3, 7, 14, 30, 60, 120, 240] as const;

export type Grade = 1 | 2 | 3 | 4;

export const GRADE_LABELS: Record<Grade, { label: string; hint: string }> = {
  1: { label: 'Errei', hint: 'Não lembrei ou errei' },
  2: { label: 'Difícil', hint: 'Lembrei com muito esforço' },
  3: { label: 'Bom', hint: 'Lembrei com algum esforço' },
  4: { label: 'Fácil', hint: 'Lembrei de imediato' },
};

export function nextInterval(
  repetitions: number,
  grade: Grade,
): { repetitions: number; days: number } {
  const r = Math.max(0, repetitions);
  if (grade === 1) return { repetitions: 0, days: 1 };
  const next = grade === 2 ? r : grade === 3 ? r + 1 : r + 2;
  return { repetitions: next, days: LADDER[Math.min(next, LADDER.length - 1)] ?? 240 };
}

export const MASTERY_LABELS = ['Não sei', 'Iniciante', 'Em progresso', 'Bom', 'Domino'] as const;

/** Domínio sugerido pelo aproveitamento em questões (espelho de private.mastery_from_accuracy). */
export function masteryFromAccuracy(questions: number, correct: number): number | null {
  if (questions <= 0) return null;
  const ratio = correct / questions;
  if (ratio < 0.5) return 1;
  if (ratio < 0.7) return 2;
  if (ratio < 0.9) return 3;
  return 4;
}

export const MASTERY_SOURCE_LABELS: Record<string, string> = {
  manual: 'Ajuste manual',
  session: 'Sessão de estudo',
  review: 'Revisão',
};

export const SCHEDULE_REASON_LABELS: Record<string, string> = {
  created: 'Criada',
  completed: 'Revisão feita',
  postponed: 'Adiada',
  rescheduled: 'Reagendada',
  session: 'Sugerida após sessão',
};
