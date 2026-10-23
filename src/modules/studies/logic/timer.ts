/**
 * Cronômetro: o tempo é SEMPRE calculado a partir de instantes gravados no banco
 * (início, pausas, fim) — nunca de um contador em memória. Recarregar a página, trocar de
 * aba ou suspender o computador não altera o resultado (RN-07).
 */
export interface PauseSpan {
  started_at: string;
  ended_at: string | null;
}

/**
 * Segundos líquidos entre `startedAt` e `endIso` (ou `nowMs`), descontando pausas.
 * Pausa aberta conta até o fim; pausas são cortadas à janela da sessão; nunca negativo.
 */
export function netSeconds(
  startedAt: string,
  pauses: readonly PauseSpan[],
  endIso: string | null,
  nowMs: number,
): number {
  const start = Date.parse(startedAt);
  const end = endIso ? Date.parse(endIso) : nowMs;
  if (!(end > start)) return 0;
  let paused = 0;
  for (const p of pauses) {
    const ps = Math.max(Date.parse(p.started_at), start);
    const pe = Math.min(p.ended_at ? Date.parse(p.ended_at) : end, end);
    if (pe > ps) paused += pe - ps;
  }
  return Math.max(0, Math.floor((end - start - paused) / 1000));
}

export function isPaused(pauses: readonly PauseSpan[]): boolean {
  return pauses.some((p) => p.ended_at === null);
}

/** "1:05:09" / "25:00" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${String(h)}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type Technique = 'free' | 'pomodoro' | 'review' | 'exercises' | 'reading' | 'video';

export const TECHNIQUE_LABELS: Record<Technique, string> = {
  free: 'Estudo livre',
  pomodoro: 'Pomodoro',
  review: 'Revisão ativa',
  exercises: 'Exercícios',
  reading: 'Leitura',
  video: 'Videoaula',
};

/** Sessão aberta há mais de 12 h provavelmente foi esquecida: oferecemos encerrar em outro horário. */
export const STALE_SESSION_SECONDS = 12 * 3600;
/** Limite do banco (focus_sessions_max_duration). */
export const MAX_SESSION_SECONDS = 24 * 3600;
