import { describe, expect, it } from 'vitest';
import {
  bucketDescription,
  type EvolutionBucket,
  bucketLabel,
  evolutionBuckets,
  evolutionNote,
  granularityFor,
} from './evolution';

function series(from: string, n: number, value: (i: number) => number) {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    seconds: value(i),
  }));
}

describe('granularidade', () => {
  it('dia até 62 dias, semana até 186, mês acima', () => {
    expect(granularityFor(1)).toBe('day');
    expect(granularityFor(62)).toBe('day');
    expect(granularityFor(92)).toBe('week'); // trimestre
    expect(granularityFor(186)).toBe('week');
    expect(granularityFor(365)).toBe('month'); // ano
  });
});

describe('dias futuros não viram zero', () => {
  it('mês em andamento: só os dias até hoje entram', () => {
    const days = series('2026-10-01', 31, () => 600);
    const b = evolutionBuckets(
      days,
      { granularity: 'day', today: '2026-10-22', weekStartsOn: 1 },
      {
        s: (d) => d.seconds,
      },
    );
    expect(b).toHaveLength(22);
    expect(b.at(-1)?.key).toBe('2026-10-22');
  });

  it('período totalmente futuro não produz baldes', () => {
    const days = series('2026-11-01', 30, () => 0);
    expect(
      evolutionBuckets(
        days,
        { granularity: 'week', today: '2026-10-22', weekStartsOn: 1 },
        {
          s: (d) => d.seconds,
        },
      ),
    ).toEqual([]);
  });
});

describe('semanas e meses parciais', () => {
  it('trimestre por semana: bordas e semana corrente são parciais', () => {
    // 01/10/2026 é quinta-feira; semana começa na segunda.
    const days = series('2026-10-01', 92, () => 60);
    const b = evolutionBuckets(
      days,
      { granularity: 'week', today: '2026-10-22', weekStartsOn: 1 },
      {
        s: (d) => d.seconds,
      },
    );
    expect(b.map((x) => x.key)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(b[0]).toMatchObject({ observedDays: 4, partial: true, firstDay: '2026-10-01' });
    expect(b[1]).toMatchObject({ observedDays: 7, partial: false, values: { s: 420 } });
    expect(b[3]).toMatchObject({ observedDays: 4, partial: true, lastDay: '2026-10-22' });
    expect(bucketLabel(b[0] as EvolutionBucket<string>, 'week')).toBe('28/09*');
    expect(bucketDescription(b[0] as EvolutionBucket<string>, 'week')).toBe(
      'Semana de 28/09 (parcial: 01/10–04/10, 4 de 7 dias)',
    );
  });

  it('ano por mês: fevereiro completo tem 28 dias e o mês corrente é parcial', () => {
    const days = series('2026-01-01', 365, () => 1);
    const b = evolutionBuckets(
      days,
      { granularity: 'month', today: '2026-10-22', weekStartsOn: 1 },
      {
        n: (d) => d.seconds,
      },
    );
    expect(b).toHaveLength(10);
    expect(b[1]).toMatchObject({
      key: '2026-02-01',
      fullDays: 28,
      observedDays: 28,
      partial: false,
    });
    expect(b[9]).toMatchObject({ key: '2026-10-01', observedDays: 22, partial: true });
    expect(bucketLabel(b[9] as EvolutionBucket<string>, 'month')).toBe('out/26*');
    expect(bucketLabel(b[1] as EvolutionBucket<string>, 'month')).toBe('fev/26');
  });

  it('soma várias métricas no mesmo balde', () => {
    const days = [
      { date: '2026-10-19', created: 2, completed: 1 },
      { date: '2026-10-20', created: 1, completed: 3 },
    ];
    const [b] = evolutionBuckets(
      days,
      { granularity: 'week', today: '2026-10-22', weekStartsOn: 1 },
      {
        created: (d) => d.created,
        completed: (d) => d.completed,
      },
    );
    expect(b?.values).toEqual({ created: 3, completed: 4 });
  });
});

describe('nota explicativa', () => {
  it('avisa parciais e dias futuros; nada a dizer em período encerrado e completo', () => {
    const days = series('2026-10-01', 92, () => 60);
    const b = evolutionBuckets(
      days,
      { granularity: 'week', today: '2026-10-22', weekStartsOn: 1 },
      {
        s: (d) => d.seconds,
      },
    );
    const note = evolutionNote(b, 'week', '2026-12-31', '2026-10-22');
    expect(note).toContain('semana parcial');
    expect(note).toContain('não aparecem');

    const closed = evolutionBuckets(
      series('2026-09-01', 30, () => 1),
      {
        granularity: 'day',
        today: '2026-10-22',
        weekStartsOn: 1,
      },
      { s: (d) => d.seconds },
    );
    expect(evolutionNote(closed, 'day', '2026-09-30', '2026-10-22')).toBeNull();
  });
});
