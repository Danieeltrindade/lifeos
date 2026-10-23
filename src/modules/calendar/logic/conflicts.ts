/**
 * Conflitos de agenda (docs/metrics.md §8) — função pura.
 *
 * Só COMPROMISSOS FIXOS e BLOCOS PLANEJADOS com horário podem conflitar: são as coisas
 * que ocupam o mesmo tempo. Prazos de tarefas e revisões são marcações de dia (não ocupam
 * horário) e o tempo REALIZADO é registro do passado, não plano — nenhum deles gera conflito.
 *
 * Intervalos são semiabertos [início, fim): um evento que termina às 10:00 não conflita
 * com outro que começa às 10:00.
 */

export interface TimedSlot {
  id: string;
  title: string;
  /** Instantes ISO (ou horário de parede — basta ser consistente). */
  start: string;
  end: string;
  /** "event" = compromisso fixo; "block" = bloco planejado. */
  kind: 'event' | 'block';
}

export interface Conflict {
  a: TimedSlot;
  b: TimedSlot;
  overlapStart: string;
  overlapEnd: string;
  overlapMinutes: number;
  /** Compromisso × compromisso é o caso mais grave (dois lugares ao mesmo tempo). */
  severity: 'commitments' | 'commitment_block' | 'blocks';
}

/** Ordena por início e compara cada slot com os que começam antes de ele terminar. */
export function findConflicts(slots: readonly TimedSlot[]): Conflict[] {
  const sorted = [...slots]
    .filter((s) => Date.parse(s.end) > Date.parse(s.start))
    .sort((x, y) => Date.parse(x.start) - Date.parse(y.start) || x.id.localeCompare(y.id));
  const out: Conflict[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (!a) continue;
    const aEnd = Date.parse(a.end);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (!b) continue;
      const bStart = Date.parse(b.start);
      if (bStart >= aEnd) break;
      const overlapEndMs = Math.min(aEnd, Date.parse(b.end));
      const minutes = Math.round((overlapEndMs - bStart) / 60_000);
      if (minutes <= 0) continue;
      const kinds = [a.kind, b.kind];
      out.push({
        a,
        b,
        overlapStart: b.start,
        overlapEnd: new Date(overlapEndMs).toISOString(),
        overlapMinutes: minutes,
        severity:
          kinds[0] === 'event' && kinds[1] === 'event'
            ? 'commitments'
            : kinds.includes('event')
              ? 'commitment_block'
              : 'blocks',
      });
    }
  }
  return out;
}

export function conflictingIds(conflicts: readonly Conflict[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    ids.add(c.a.id);
    ids.add(c.b.id);
  }
  return ids;
}

/**
 * Carga planejada por dia (minutos de compromissos + blocos com horário), para detectar
 * sobrecarga. Um item que cruza a meia-noite é dividido entre os dias.
 */
export function plannedMinutesByDay(
  slots: readonly TimedSlot[],
  dayOf: (instantMs: number) => string,
  dayStartMs: (day: string) => number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of slots) {
    let cursor = Date.parse(s.start);
    const end = Date.parse(s.end);
    let guard = 0;
    while (cursor < end && guard < 400) {
      const day = dayOf(cursor);
      const nextDayStart = dayStartMs(nextIsoDay(day));
      const segmentEnd = Math.min(end, nextDayStart);
      out.set(day, (out.get(day) ?? 0) + (segmentEnd - cursor) / 60_000);
      cursor = segmentEnd;
      guard += 1;
    }
  }
  return out;
}

function nextIsoDay(day: string): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
