import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dateRange,
  fromLocalInput,
  secondsBetween,
  startOfWeek,
  toLocalInput,
  weekdayOf,
  zonedToUtc,
} from './zoned';

describe('zonedToUtc', () => {
  it('converte data e hora locais de São Paulo (UTC−3)', () => {
    expect(zonedToUtc('2026-10-20', '14:00', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-20T17:00:00.000Z',
    );
  });

  it('não depende do fuso do navegador (Tóquio, UTC+9)', () => {
    expect(zonedToUtc('2026-10-20', '08:30', 'Asia/Tokyo').toISOString()).toBe(
      '2026-10-19T23:30:00.000Z',
    );
  });

  it('horário inexistente no início do horário de verão avança para o primeiro válido', () => {
    // Nova York, 08/03/2026: 02:00 → 03:00.
    expect(zonedToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  it('horário ambíguo no fim do horário de verão usa a primeira ocorrência', () => {
    // Nova York, 01/11/2026: 01:30 acontece duas vezes (EDT e depois EST).
    expect(zonedToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('dia de 23 horas: meia-noite a meia-noite', () => {
    const start = zonedToUtc('2026-03-08', '00:00', 'America/New_York');
    const end = zonedToUtc('2026-03-09', '00:00', 'America/New_York');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});

describe('inputs datetime-local no fuso do perfil', () => {
  it('ida e volta preservam o instante', () => {
    const iso = '2026-10-20T02:15:00.000Z';
    const local = toLocalInput(iso, 'America/Sao_Paulo');
    expect(local).toBe('2026-10-19T23:15');
    expect(fromLocalInput(local, 'America/Sao_Paulo')).toBe(iso);
  });

  it('valor inválido vira null', () => {
    expect(fromLocalInput('', 'UTC')).toBeNull();
  });
});

describe('calendário', () => {
  it('dia da semana e início da semana', () => {
    expect(weekdayOf('2026-10-21')).toBe(3);
    expect(startOfWeek('2026-10-21', 1)).toBe('2026-10-19');
    expect(startOfWeek('2026-10-21', 0)).toBe('2026-10-18');
    expect(startOfWeek('2026-10-18', 1)).toBe('2026-10-12');
  });

  it('somar meses respeita o último dia do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('intervalo de datas é semiaberto', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('segundos entre instantes nunca são negativos', () => {
    expect(secondsBetween('2026-10-20T10:00:00Z', '2026-10-20T09:00:00Z')).toBe(0);
    expect(secondsBetween('2026-10-20T10:00:00Z', '2026-10-20T10:01:30Z')).toBe(90);
  });
});
