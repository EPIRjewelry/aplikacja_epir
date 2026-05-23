import { describe, expect, it } from 'vitest';
import { sheetValuesToCsv, valuesToCsv } from '../src/convert/sheets-to-csv.js';

describe('sheetValuesToCsv', () => {
  it('escapes commas and quotes', () => {
    const csv = valuesToCsv([['name', 'note'], ['ring', 'hello, "world"']]);
    expect(csv).toBe('name,note\nring,"hello, ""world"""');
  });

  it('pads short rows to common width', () => {
    const csv = sheetValuesToCsv([
      ['a', 'b', 'c'],
      ['1', '2'],
    ]);
    expect(csv.split('\n')[1]).toBe('1,2,');
  });

  it('skips empty rows', () => {
    const csv = valuesToCsv([
      ['x'],
      [null, ''],
      ['y'],
    ]);
    expect(csv).toBe('x\ny');
  });
});
