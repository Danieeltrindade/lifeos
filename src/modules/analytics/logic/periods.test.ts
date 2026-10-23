import { describe, expect, it } from 'vitest';
import {
  comparisonFor,
  nextPeriod,
  periodDays,
  periodFromParams,
  periodLabel,
  periodProgress,
  periodToParams,
  previousPeriod,
  resolvePeriod,
} from './periods';

describe('resolvePeriod', () => {
  it('semana respeita o dia de início escolhido no perfil', () => {
    // 22/10/2026 é quinta-feira.
    expect(resolvePeriod('week', '2026-10-22', 1)).toEqual({
      kind: 'week',
      from: '2026-10-19',
      to: '2026-10-26',
    });
    expect(resolvePeriod('week', '2026-10-22', 0).from).toBe('2026-10-18');
  });

  it('mês, trimestre e ano são de calendário', () => {
    expect(resolvePeriod('month', '2026-02-14', 1)).toMatchObject({
      from: '2026-02-01',
      to: '2026-03-01',
    });
    expect(resolvePeriod('quarter', '2026-11-30', 1)).toMatchObject({
      from: '2026-10-01',
      to: '2027-01-01',
    });
    expect(resolvePeriod('year', '2028-07-01', 1)).toMatchObject({
      from: '2028-01-01',
      to: '2029-01-01',
    });
    expect(periodDays(resolvePeriod('year', '2028-07-01', 1))).toBe(366);
  });

  it('personalizado corrige a ordem e limita a 731 dias', () => {
    const p = resolvePeriod('custom', '2026-10-22', 1, {
      from: '2026-10-10',
      toInclusive: '2026-10-01',
    });
    expect(p).toMatchObject({ from: '2026-10-01', to: '2026-10-11' });
    const long = resolvePeriod('custom', '2026-10-22', 1, {
      from: '2020-01-01',
      toInclusive: '2026-01-01',
    });
    expect(periodDays(long)).toBe(731);
  });
});

describe('previousPeriod (período anterior equivalente)', () => {
  it('mês anterior tem a duração do mês anterior, não 30 dias', () => {
    const march = resolvePeriod('month', '2026-03-15', 1);
    expect(previousPeriod(march)).toMatchObject({ from: '2026-02-01', to: '2026-03-01' });
    expect(periodDays(previousPeriod(march))).toBe(28);
  });

  it('ano anterior e trimestre anterior', () => {
    expect(previousPeriod(resolvePeriod('year', '2026-05-01', 1))).toMatchObject({
      from: '2025-01-01',
      to: '2026-01-01',
    });
    expect(previousPeriod(resolvePeriod('quarter', '2026-01-10', 1))).toMatchObject({
      from: '2025-10-01',
      to: '2026-01-01',
    });
  });

  it('personalizado: mesma duração imediatamente antes', () => {
    const p = resolvePeriod('custom', '2026-10-22', 1, {
      from: '2026-10-01',
      toInclusive: '2026-10-10',
    });
    expect(previousPeriod(p)).toMatchObject({ from: '2026-09-21', to: '2026-10-01' });
  });

  it('navegação para o período seguinte', () => {
    const w = resolvePeriod('week', '2026-10-22', 1);
    expect(nextPeriod(w, 1)).toMatchObject({ from: '2026-10-26', to: '2026-11-02' });
  });
});

describe('periodProgress e comparação', () => {
  it('período em andamento é incompleto e conta hoje como transcorrido', () => {
    const w = resolvePeriod('week', '2026-10-22', 1);
    expect(periodProgress(w, '2026-10-22')).toEqual({
      state: 'current',
      elapsedDays: 4,
      totalDays: 7,
      incomplete: true,
    });
    expect(periodProgress(w, '2026-11-01').state).toBe('past');
    expect(periodProgress(w, '2026-10-01').state).toBe('future');
  });

  it('período em andamento compara com os mesmos N primeiros dias do anterior', () => {
    const month = resolvePeriod('month', '2026-03-31', 1);
    const c = comparisonFor(month, '2026-03-31');
    // 31 dias transcorridos, mas fevereiro só tem 28: compara com fevereiro inteiro.
    expect(c).toMatchObject({ aligned: true, previous: { from: '2026-02-01', to: '2026-03-01' } });
    const c2 = comparisonFor(month, '2026-03-10');
    expect(c2?.previous).toEqual({ from: '2026-02-01', to: '2026-02-11' });
  });

  it('período encerrado compara com o anterior inteiro; futuro não compara', () => {
    const w = resolvePeriod('week', '2026-10-12', 1);
    expect(comparisonFor(w, '2026-10-22')).toMatchObject({
      aligned: false,
      previous: { from: '2026-10-05', to: '2026-10-12' },
    });
    expect(comparisonFor(resolvePeriod('week', '2026-12-01', 1), '2026-10-22')).toBeNull();
  });
});

describe('parâmetros de URL (filtro persistente)', () => {
  it('ida e volta preserva o período', () => {
    const p = resolvePeriod('custom', '2026-10-22', 1, {
      from: '2026-09-01',
      toInclusive: '2026-09-30',
    });
    const params = periodToParams(p, new URLSearchParams('aba=estudos'));
    expect(params.get('aba')).toBe('estudos');
    expect(periodFromParams(params, '2026-10-22', 1)).toEqual(p);
  });

  it('valores inválidos caem no padrão (semana atual)', () => {
    const p = periodFromParams(new URLSearchParams('periodo=xyz&data=2026-99-99'), '2026-10-22', 1);
    expect(p).toMatchObject({ kind: 'week', from: '2026-10-19' });
  });

  it('rótulos', () => {
    expect(periodLabel(resolvePeriod('month', '2026-10-22', 1))).toBe('outubro de 2026');
    expect(periodLabel(resolvePeriod('quarter', '2026-10-22', 1))).toBe('4º trimestre de 2026');
    expect(periodLabel(resolvePeriod('week', '2026-10-22', 1))).toBe('19/10/2026 a 25/10/2026');
  });
});
