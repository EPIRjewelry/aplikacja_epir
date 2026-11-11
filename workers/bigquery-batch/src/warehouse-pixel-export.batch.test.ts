import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeD1RetryDelayMs } from './d1-retry';
import { postPipelineIngestBatch } from './pipeline-ingest';
import { DEFAULT_WATERMARK, exportPixelEvents, type ExportWatermark } from './warehouse-pixel-export';
import {
  resolvePixelExportBatchSize,
  resolvePixelExportMaxRows,
} from './warehouse-batch-env';

vi.mock('./pipeline-ingest', () => ({
  postPipelineIngestBatch: vi.fn(async () => ({ ok: true as const })),
}));

const PII = 'pii-customer-should-not-leak';
/** Ms epoch — `pixelCreatedAtMs` traktuje liczby ≤ 1e12 jak sekundy. */
const T0 = 1_700_000_000_000;

type Row = {
  id: string;
  created_at: number;
  session_id: string;
  event_type: string;
  customer_id: string;
};

function row(id: string, created_at: number): Row {
  return { id, created_at, session_id: 'sess', event_type: 'page_viewed', customer_id: PII };
}

function createDb(
  rows: Row[],
  opts?: { throwOnRead?: (n: number) => boolean; failPersist?: number },
) {
  const sorted = [...rows].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at - b.created_at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  let reads = 0;
  let persists = 0;
  const saved: { ms: number; id: string; sql: string }[] = [];
  const prepare = vi.fn((sql: string) => {
    const bound: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        bound.length = 0;
        bound.push(...args);
        return stmt;
      },
      async all() {
        reads += 1;
        if (opts?.throwOnRead?.(reads)) throw new Error('D1_ERROR: D1 DB is overloaded');
        const ms = Number(bound[0] ?? 0);
        const id = String(bound[1] ?? '');
        const limit = Number(bound[2] ?? 500);
        const page = sorted
          .filter((r) => r.created_at > ms || (r.created_at === ms && r.id > id))
          .slice(0, limit);
        return { results: page };
      },
      async run() {
        persists += 1;
        if (persists <= (opts?.failPersist ?? 0)) throw new Error('D1_ERROR: D1 DB is overloaded');
        saved.push({ ms: Number(bound[0]), id: String(bound[1] ?? ''), sql });
      },
      async first() {
        return null;
      },
    };
    return stmt;
  });
  return {
    db: { prepare } as unknown as D1Database,
    saved,
    reads: () => reads,
  };
}

function envOf(db: D1Database) {
  return {
    DB: db,
    DB_CHATBOT: db,
    PIPELINE_PIXEL_INGEST_URL: 'https://example.invalid/pixel',
    PIPELINE_EXPORT_EXTENDED_FIELDS: 'true',
  };
}

const fast = {
  sleep: vi.fn(async () => {}),
  random: () => 0,
  maxAttempts: 3,
  baseDelayMs: 10,
  now: () => 1_700_000_111_000,
};

function batchLogs(lines: string[]) {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as {
          tag?: string;
          rows?: number;
          durationMs?: number;
          attempts?: number;
          result?: string;
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x?.tag === 'pixel_export_batch');
}

describe('exportPixelEvents D1 overload', () => {
  beforeEach(() => {
    fast.sleep.mockClear();
    vi.mocked(postPipelineIngestBatch).mockReset();
    vi.mocked(postPipelineIngestBatch).mockResolvedValue({ ok: true });
  });

  it('retries overloaded on attempt 1 and 2 and commits the cursor on attempt 3', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => {
      lines.push(String(m));
    });
    const store = createDb([row('a', T0 + 5_000)], { throwOnRead: (n) => n < 3 });
    const wm: ExportWatermark = { ...DEFAULT_WATERMARK };

    const result = await exportPixelEvents(envOf(store.db), wm, 1, { ...fast, batchSize: 500 });

    expect(result.exported).toBe(1);
    expect(result.pipelineError).toBeUndefined();
    expect(result.cursor).toEqual({ last_pixel_export_at: T0 + 5_000, last_pixel_export_id: 'a' });
    expect(store.reads()).toBe(3);
    expect(store.saved).toEqual([
      expect.objectContaining({ ms: T0 + 5_000, id: 'a' }),
    ]);
    expect(store.saved[0]!.sql).toContain('last_pixel_export_id');
    expect(store.saved[0]!.sql).not.toContain('last_messages_export_at');
    expect(fast.sleep).toHaveBeenCalledTimes(2);
    expect(fast.sleep).toHaveBeenNthCalledWith(1, computeD1RetryDelayMs(1, 10, () => 0));
    expect(fast.sleep).toHaveBeenNthCalledWith(2, computeD1RetryDelayMs(2, 10, () => 0));

    const logs = batchLogs(lines);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ rows: 1, attempts: 3, result: 'ok' });
    expect(logs[0]!.durationMs).toEqual(expect.any(Number));
    expect(Object.keys(logs[0]!).sort()).toEqual(['attempts', 'durationMs', 'result', 'rows', 'tag']);
    expect(lines.join('\n')).not.toContain(PII);
    spy.mockRestore();
  });
});

describe('exportPixelEvents cursor', () => {
  beforeEach(() => {
    fast.sleep.mockClear();
    vi.mocked(postPipelineIngestBatch).mockReset();
    vi.mocked(postPipelineIngestBatch).mockResolvedValue({ ok: true });
  });

  it('moves the cursor only after a batch is ingested and persisted', async () => {
    const rows = [row('a', T0 + 1_000), row('b', T0 + 2_000), row('c', T0 + 3_000), row('d', T0 + 4_000)];
    const store = createDb(rows, { throwOnRead: (n) => n > 1 });
    const wm: ExportWatermark = { ...DEFAULT_WATERMARK, last_pixel_export_at: 0, last_pixel_export_id: '' };

    const result = await exportPixelEvents(envOf(store.db), wm, 100, { ...fast, batchSize: 2 });

    expect(result.exported).toBe(2);
    expect(result.cursor).toEqual({ last_pixel_export_at: T0 + 2_000, last_pixel_export_id: 'b' });
    expect(result.pipelineError).toMatch(/overloaded/);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toMatchObject({ ms: T0 + 2_000, id: 'b' });
    expect(store.reads()).toBe(4);
    expect(vi.mocked(postPipelineIngestBatch)).toHaveBeenCalledTimes(1);
  });

  it('does not persist when pipeline ingest fails', async () => {
    vi.mocked(postPipelineIngestBatch).mockResolvedValue({ ok: false, status: 502, body: 'upstream' });
    const store = createDb([row('a', T0 + 1_000), row('b', T0 + 2_000)]);
    const wm: ExportWatermark = { ...DEFAULT_WATERMARK, last_pixel_export_at: 9, last_pixel_export_id: 'z' };

    const result = await exportPixelEvents(envOf(store.db), wm, 100, { ...fast, batchSize: 2 });

    expect(result.exported).toBe(0);
    expect(result.cursor).toEqual({ last_pixel_export_at: 9, last_pixel_export_id: 'z' });
    expect(result.pipelineError).toMatch(/HTTP 502/);
    expect(store.saved).toHaveLength(0);
  });

  it('does not advance when cursor persist stays overloaded', async () => {
    const store = createDb([row('a', T0 + 1_000), row('b', T0 + 2_000)], { failPersist: 3 });
    const wm: ExportWatermark = { ...DEFAULT_WATERMARK };

    const result = await exportPixelEvents(envOf(store.db), wm, 100, { ...fast, batchSize: 2 });

    expect(result.exported).toBe(0);
    expect(result.cursor).toEqual({ last_pixel_export_at: 0, last_pixel_export_id: '' });
    expect(result.pipelineError).toMatch(/cursor persist failed/);
    expect(store.saved).toHaveLength(0);
    expect(store.reads()).toBe(1);
    expect(vi.mocked(postPipelineIngestBatch)).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-transient D1 read error', async () => {
    let reads = 0;
    const prepare = vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn(async () => {
        reads += 1;
        throw new Error('D1_ERROR: no such column: foo');
      }),
      run: vi.fn(),
    }));
    const db = { prepare } as unknown as D1Database;
    const result = await exportPixelEvents(envOf(db), { ...DEFAULT_WATERMARK }, 10, fast);
    expect(reads).toBe(1);
    expect(fast.sleep).not.toHaveBeenCalled();
    expect(result.exported).toBe(0);
    expect(result.cursor.last_pixel_export_at).toBe(0);
    expect(result.pipelineError).toMatch(/no such column/);
  });
});

describe('exportPixelEvents backlog catch-up', () => {
  beforeEach(() => {
    fast.sleep.mockClear();
    vi.mocked(postPipelineIngestBatch).mockReset();
    vi.mocked(postPipelineIngestBatch).mockResolvedValue({ ok: true });
  });

  it('drains the backlog across batches and a later run without gaps or duplicates', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => {
      lines.push(String(m));
    });
    const rows = [
      row('a', T0),
      row('b', T0),
      row('c', T0 + 1_000),
      row('d', T0 + 2_000),
      row('e', T0 + 3_000),
      row('f', T0 + 4_000),
    ];
    const store = createDb(rows);
    const sleep = vi.fn(async () => {});

    const first = await exportPixelEvents(envOf(store.db), { ...DEFAULT_WATERMARK }, 4, {
      ...fast,
      sleep,
      batchSize: 2,
      pauseMs: 200,
    });

    expect(first.exported).toBe(4);
    expect(first.pipelineError).toBeUndefined();
    expect(first.cursor).toEqual({ last_pixel_export_at: T0 + 2_000, last_pixel_export_id: 'd' });
    expect(store.saved.map((s) => s.id)).toEqual(['b', 'd']);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(200);

    const second = await exportPixelEvents(envOf(store.db), { ...DEFAULT_WATERMARK, ...first.cursor }, 10, {
      ...fast,
      sleep,
      batchSize: 2,
      pauseMs: 200,
    });

    expect(second.exported).toBe(2);
    expect(second.cursor).toEqual({ last_pixel_export_at: T0 + 4_000, last_pixel_export_id: 'f' });
    expect(store.saved.map((s) => s.id)).toEqual(['b', 'd', 'f']);

    const sent = vi.mocked(postPipelineIngestBatch).mock.calls.flatMap((call) => {
      const records = call[2] as { id?: string }[];
      return records.map((r) => r.id);
    });
    expect(sent).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

    const third = await exportPixelEvents(
      envOf(store.db),
      { ...DEFAULT_WATERMARK, ...second.cursor },
      10,
      { ...fast, batchSize: 2 },
    );
    expect(third.exported).toBe(0);
    expect(third.cursor).toEqual(second.cursor);
    expect(sent).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

    const logs = batchLogs(lines);
    expect(logs.filter((l) => l.result === 'ok').map((l) => l.rows)).toEqual([2, 2, 2]);
    expect(lines.join('\n')).not.toContain(PII);
    spy.mockRestore();
  });
});

describe('pixel export batch config', () => {
  it('defaults to 500 and clamps an oversized batch', () => {
    expect(resolvePixelExportBatchSize({})).toBe(500);
    expect(resolvePixelExportMaxRows({})).toBe(500);
    expect(resolvePixelExportBatchSize({ WAREHOUSE_PIXEL_EXPORT_BATCH_SIZE: '200' })).toBe(200);
    expect(resolvePixelExportBatchSize({ WAREHOUSE_PIXEL_EXPORT_BATCH_SIZE: '9000' })).toBe(2000);
    expect(resolvePixelExportBatchSize({ WAREHOUSE_PIXEL_EXPORT_BATCH_SIZE: 'nope' })).toBe(500);
    expect(resolvePixelExportMaxRows({ WAREHOUSE_PIXEL_EXPORT_MAX_ROWS: '500' })).toBe(500);
  });
});
