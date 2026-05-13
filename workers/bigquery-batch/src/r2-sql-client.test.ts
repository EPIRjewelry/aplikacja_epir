import { describe, it, expect } from 'vitest';
import { parseR2SqlJsonToRows } from './r2-sql-client';

describe('parseR2SqlJsonToRows', () => {
  it('parses data array of objects', () => {
    const rows = parseR2SqlJsonToRows({
      data: [
        { a: 1, b: 'x' },
        { a: 2, b: 'y' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].a).toBe(1);
  });

  it('parses columns + rows matrix', () => {
    const rows = parseR2SqlJsonToRows({
      columns: ['event_type', 'event_count'],
      rows: [
        ['page_viewed', 10],
        ['purchase_completed', 2],
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].event_type).toBe('page_viewed');
    expect(rows[0].event_count).toBe(10);
  });

  it('returns empty for unknown shape', () => {
    expect(parseR2SqlJsonToRows({ foo: 1 })).toEqual([]);
  });
});
