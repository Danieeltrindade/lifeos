import { describe, expect, it } from 'vitest';
import { formatClock, isPaused, netSeconds } from './timer';

const at = (iso: string) => Date.parse(iso);

describe('tempo líquido da sessão', () => {
  it('duração simples', () => {
    expect(netSeconds('2026-10-20T10:00:00Z', [], '2026-10-20T10:50:00Z', 0)).toBe(3000);
  });

  it('desconta pausas encerradas', () => {
    const pauses = [
      { started_at: '2026-10-20T10:10:00Z', ended_at: '2026-10-20T10:15:00Z' },
      { started_at: '2026-10-20T10:30:00Z', ended_at: '2026-10-20T10:31:30Z' },
    ];
    expect(netSeconds('2026-10-20T10:00:00Z', pauses, '2026-10-20T11:00:00Z', 0)).toBe(3600 - 390);
  });

  it('pausa aberta congela o cronômetro (tempo não avança enquanto pausado)', () => {
    const pauses = [{ started_at: '2026-10-20T10:20:00Z', ended_at: null }];
    const a = netSeconds('2026-10-20T10:00:00Z', pauses, null, at('2026-10-20T10:30:00Z'));
    const b = netSeconds('2026-10-20T10:00:00Z', pauses, null, at('2026-10-20T12:00:00Z'));
    expect(a).toBe(1200);
    expect(b).toBe(1200);
    expect(isPaused(pauses)).toBe(true);
  });

  it('sessão que cruza a meia-noite conta inteira', () => {
    expect(netSeconds('2026-10-20T23:30:00-03:00', [], '2026-10-21T00:45:00-03:00', 0)).toBe(4500);
  });

  it('recarregar a página não muda nada: o cálculo só depende dos instantes', () => {
    const now = at('2026-10-20T10:25:00Z');
    expect(netSeconds('2026-10-20T10:00:00Z', [], null, now)).toBe(
      netSeconds('2026-10-20T10:00:00Z', [], null, now),
    );
  });

  it('nunca negativo: fim antes do início ou pausa fora da janela', () => {
    expect(netSeconds('2026-10-20T10:00:00Z', [], '2026-10-20T09:00:00Z', 0)).toBe(0);
    const outside = [{ started_at: '2026-10-20T12:00:00Z', ended_at: '2026-10-20T13:00:00Z' }];
    expect(netSeconds('2026-10-20T10:00:00Z', outside, '2026-10-20T11:00:00Z', 0)).toBe(3600);
  });

  it('relógio do dispositivo atrasado em relação ao início não gera tempo negativo', () => {
    expect(netSeconds('2026-10-20T10:00:00Z', [], null, at('2026-10-20T09:59:00Z'))).toBe(0);
  });
});

describe('formatClock', () => {
  it('mm:ss e h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(3909)).toBe('1:05:09');
  });
});
