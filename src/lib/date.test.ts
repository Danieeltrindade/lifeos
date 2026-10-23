import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDateOnly,
  formatDuration,
  formatLongDate,
  formatTime,
  greetingFor,
  isValidTimeZone,
  localDateIn,
  relativeDayLabel,
} from './date';

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [85, '1 h 25 min'],
    [-5, '0 min'],
  ])('%i minutos → "%s"', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe('fuso do perfil, não do navegador', () => {
  // 20/10/2026 02:30 UTC = 19/10 23:30 em São Paulo = 20/10 11:30 em Tóquio.
  const instant = new Date('2026-10-20T02:30:00Z');

  it('o dia local depende do fuso informado', () => {
    expect(localDateIn(instant, 'America/Sao_Paulo')).toBe('2026-10-19');
    expect(localDateIn(instant, 'Asia/Tokyo')).toBe('2026-10-20');
    expect(localDateIn(instant, 'UTC')).toBe('2026-10-20');
  });

  it('horário e saudação seguem o fuso', () => {
    expect(formatTime(instant.toISOString(), 'America/Sao_Paulo')).toBe('23:30');
    expect(formatTime(instant.toISOString(), 'Asia/Tokyo')).toBe('11:30');
    expect(greetingFor(instant, 'America/Sao_Paulo')).toBe('Boa noite');
    expect(greetingFor(instant, 'Asia/Tokyo')).toBe('Bom dia');
  });

  it('respeita as faixas do dia', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h + 3, 0)); // horário de São Paulo (-03)
    expect(greetingFor(at(4), 'America/Sao_Paulo')).toBe('Boa noite');
    expect(greetingFor(at(5), 'America/Sao_Paulo')).toBe('Bom dia');
    expect(greetingFor(at(12), 'America/Sao_Paulo')).toBe('Boa tarde');
    expect(greetingFor(at(18), 'America/Sao_Paulo')).toBe('Boa noite');
  });

  it('data por extenso no fuso', () => {
    expect(formatLongDate(instant, 'America/Sao_Paulo')).toBe('Segunda-feira, 19 de outubro');
    expect(formatLongDate(instant, 'Asia/Tokyo')).toBe('Terça-feira, 20 de outubro');
  });

  it('valida fusos IANA', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('Hora/Inventada')).toBe(false);
  });
});

describe('datas de calendário (sem fuso)', () => {
  it('formata sem deslocar o dia, qualquer que seja o fuso do ambiente', () => {
    expect(formatDateOnly('2026-10-22')).toBe('22 de out');
    expect(formatDateOnly('2026-01-01')).toBe('01 de jan');
  });

  it('conta dias de calendário, inclusive na virada do horário de verão', () => {
    expect(daysBetween('2026-10-21', '2026-10-20')).toBe(1);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(2);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('gera rótulos relativos ao "hoje" do perfil', () => {
    const today = '2026-10-20';
    expect(relativeDayLabel('2026-10-20', today)).toBe('Hoje');
    expect(relativeDayLabel('2026-10-21', today)).toBe('Amanhã');
    expect(relativeDayLabel('2026-10-19', today)).toBe('Ontem');
    expect(relativeDayLabel('2026-10-17', today)).toBe('Há 3 dias');
    expect(relativeDayLabel('2026-10-25', today)).toBe('Em 5 dias');
  });
});
