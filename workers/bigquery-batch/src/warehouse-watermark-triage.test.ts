import { describe, expect, it, vi } from 'vitest';
import {
  applyHistoricalBacklogTriage,
  isCursorStrictlyAfter,
  shouldAttemptHistoricalTriage,
} from './warehouse-watermark-triage';
import { DEFAULT_WATERMARK } from './warehouse-pixel-export';

describe('isCursorStrictlyAfter', () => {
  it('orders by ms then id', () => {
    expect(isCursorStrictlyAfter({ ms: 2, id: 'a' }, { ms: 1, id: 'z' })).toBe(true);
    expect(isCursorStrictlyAfter({ ms: 1, id: 'b' }, { ms: 1, id: 'a' })).toBe(true);
    expect(isCursorStrictlyAfter({ ms: 1, id: 'a' }, { ms: 1, id: 'a' })).toBe(false);
  });
});

describe('shouldAttemptHistoricalTriage', () => {
  it('requires flag', () => {
    expect(shouldAttemptHistoricalTriage({}, 20_000, 'watermark_reset')).toBe(false);
    expect(
      shouldAttemptHistoricalTriage(
        { WAREHOUSE_PIXEL_HISTORY_TRIAGE_ENABLED: 'true' },
        20_000,
        'watermark_reset',
      ),
    ).toBe(true);
  });
});

describe('applyHistoricalBacklogTriage', () => {
  const juneMs = Date.parse('2026-06-04T06:18:00.000Z');
  const septMs = Date.parse('2026-09-22T12:00:00.000Z');

  it('no-op on read_error', async () => {
    const r = await applyHistoricalBacklogTriage(
      { DB: {} as D1Database, PIPELINE_PIXEL_INGEST_URL: 'https://x.ingest', WAREHOUSE_PIXEL_HISTORY_TRIAGE_ENABLED: 'true' },
      { status: 'read_error', watermark: { ...DEFAULT_WATERMARK } },
      143_000,
    );
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('watermark_load_read_error');
  });

  it('applies forward skip when watermark_reset and logs audit fields', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const run = vi.fn().mockResolvedValue({ changes: 1 });

    const prepare = vi.fn((sql: string) => {
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(),
        run,
        all: vi.fn(),
      };
      if (sql.includes('ORDER BY') && sql.includes('LIMIT 1')) {
        stmt.first.mockResolvedValue({ id: 'ev-sept', created_at: septMs });
      } else if (sql.includes('COUNT(*)')) {
        if (sql.includes('pixelExportCursorWhereSql') || sql.includes('julianday')) {
          stmt.first.mockResolvedValue({ cnt: 140_000 });
        }
      }
      if (sql.includes('COUNT(*) AS cnt FROM pixel_events WHERE')) {
        stmt.first.mockResolvedValue({ cnt: 140_000 });
      }
      return stmt;
    });

    const db = { prepare } as unknown as D1Database;

    const r = await applyHistoricalBacklogTriage(
      {
        DB: db,
        PIPELINE_PIXEL_INGEST_URL: 'https://x.ingest',
        WAREHOUSE_PIXEL_HISTORY_TRIAGE_ENABLED: 'true',
        WAREHOUSE_PIXEL_TRIAGE_KEEP_DAYS: '7',
      },
      {
        status: 'ok',
        watermark: {
          ...DEFAULT_WATERMARK,
          last_pixel_export_at: juneMs,
          last_pixel_export_id: 'old',
        },
      },
      143_010,
      { nowMs: Date.parse('2026-09-29T02:00:00.000Z') },
    );

    expect(r.applied).toBe(true);
    expect(r.skipped_estimate).toBe(140_000);
    expect(r.new_ms).toBe(septMs);
    expect(run).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '[WAREHOUSE_BATCH] watermark_history_triage',
      expect.stringContaining('skipped_estimate'),
    );
    log.mockRestore();
  });

  it('no-op when triage disabled', async () => {
    const r = await applyHistoricalBacklogTriage(
      { DB: {} as D1Database, PIPELINE_PIXEL_INGEST_URL: 'https://x.ingest' },
      {
        status: 'ok',
        watermark: { ...DEFAULT_WATERMARK, last_pixel_export_at: juneMs },
      },
      143_000,
    );
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('triage_disabled');
  });
});
