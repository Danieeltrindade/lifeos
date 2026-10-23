import { describe, expect, it } from 'vitest';
import { csvCell, recordsToCsv, toCsv } from './export';

describe('CSV', () => {
  it('escapa separadores, aspas e quebras de linha', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('linha\nnova')).toBe('"linha\nnova"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(3.5)).toBe('3.5');
  });

  it('neutraliza fórmulas (injeção de CSV)', () => {
    expect(csvCell('=SOMA(A1)')).toBe("'=SOMA(A1)");
    expect(csvCell('+55 11')).toBe("'+55 11");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell(-3)).toBe('-3');
  });

  it('cabeçalho com BOM e CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('\uFEFFa,b\r\n1,x\r\n');
  });

  it('registros heterogêneos: união das chaves; objetos viram JSON', () => {
    const csv = recordsToCsv([
      { id: 1, tags: ['a'] },
      { id: 2, extra: true },
    ]);
    expect(csv).toBe('\uFEFFid,tags,extra\r\n1,"[""a""]",\r\n2,,true\r\n');
  });
});
