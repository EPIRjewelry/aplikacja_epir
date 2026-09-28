import { describe, expect, it } from 'vitest';
import {
  pixelCreatedAtIso,
  pixelCreatedAtMs,
  pixelExportCursorWhereSql,
  pixelExportOrderBySql,
  rowExportCursorMsId,
} from './d1-timestamps';

describe('pixelCreatedAtMs', () => {
  it('parses INTEGER ms from D1', () => {
    expect(pixelCreatedAtMs(1761723289000)).toBe(1761723289000);
  });

  it('parses numeric string ms', () => {
    expect(pixelCreatedAtMs('1761723289000')).toBe(1761723289000);
  });

  it('parses ISO text', () => {
    const iso = '2026-01-15T12:00:00.000Z';
    expect(pixelCreatedAtMs(iso)).toBe(Date.parse(iso));
  });

  it('pixelCreatedAtIso returns ISO from ms integer', () => {
    expect(pixelCreatedAtIso(1761723289000)).toBe(new Date(1761723289000).toISOString());
  });
});

describe('export cursor (ms, id)', () => {
  it('uses julianday for ISO created_at in WHERE/ORDER BY', () => {
    expect(pixelExportCursorWhereSql()).toContain('julianday');
    expect(pixelExportOrderBySql()).toContain('julianday');
  });

  it('rowExportCursorMsId tie-breaks on id at same ms', () => {
    const iso = '2026-01-15T12:00:00.123Z';
    const ms = Date.parse(iso);
    const a = rowExportCursorMsId({ created_at: iso, id: '100' });
    const b = rowExportCursorMsId({ created_at: iso, id: '200' });
    expect(a.ms).toBe(b.ms);
    expect(a.id < b.id).toBe(true);
  });
});
