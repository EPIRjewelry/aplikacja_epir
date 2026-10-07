import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowHealthReport } from './edog-flow-health-runner';

const buildFlowHealthReport = vi.fn();
const fetchGemmaConversations24h = vi.fn();
const buildGemmaDigestMarkdown = vi.fn();

vi.mock('./edog-flow-health-runner', () => ({
  buildFlowHealthReport: (...args: unknown[]) => buildFlowHealthReport(...args),
}));

vi.mock('./operator-gemma-digest', () => ({
  fetchGemmaConversations24h: (...args: unknown[]) => fetchGemmaConversations24h(...args),
  buildGemmaDigestMarkdown: (...args: unknown[]) => buildGemmaDigestMarkdown(...args),
}));

vi.mock('./d1-retry', async () => {
  const actual = await vi.importActual<typeof import('./d1-retry')>('./d1-retry');
  return {
    ...actual,
    withD1Retry: async <T>(
      fn: () => Promise<T>,
      opts: { step: string; sleep?: (ms: number) => Promise<void>; random?: () => number },
    ) =>
      actual.withD1Retry(fn, {
        ...opts,
        sleep: opts.sleep ?? (async () => {}),
        random: opts.random ?? (() => 0),
        baseDelayMs: 1,
      }),
  };
});

import {
  parseOperatorReportDate,
  persistOperatorDailyReport,
  runOperatorDailyReport,
} from './operator-daily-report';

function mockHealth(verdict: 'PASS' | 'FAIL' = 'FAIL'): FlowHealthReport {
  return {
    pending_pixel_events: 0,
    batch_exports: { last_pixel_export_at: 0, last_messages_export_at: 0, updated_at: Date.now() },
    pipeline_pixel_configured: true,
    pipeline_messages_configured: true,
    d1_pixel_events_24h: 1,
    d1_messages_24h: 1,
    pixel_null_session_24h: 0,
    pixel_null_session_rate_24h: 0,
    chat_pixel_session_match_rate: 1,
    chat_sessions_24h: 0,
    warehouse_q1_ok: false,
    warehouse_q1_row_count: null,
    warehouse_q1_skipped: true,
    warehouse_pixel_sessions: null,
    checked_at: new Date().toISOString(),
    edog_verdict: verdict,
    reasons: ['test'],
  };
}

function mockD1Run(sequence: Array<'fail' | 'ok'>): {
  db: D1Database;
  runCount: () => number;
  bound: () => unknown[];
} {
  let runCount = 0;
  let lastBound: unknown[] = [];
  const stmt = {
    bind: (...args: unknown[]) => {
      lastBound = args;
      return {
        run: async () => {
          const outcome = sequence[Math.min(runCount, sequence.length - 1)];
          runCount += 1;
          if (outcome === 'fail') {
            throw new Error('D1_ERROR: Network connection lost.');
          }
          return { success: true, meta: {} };
        },
      };
    },
  };
  const db = {
    prepare: () => stmt,
  } as unknown as D1Database;
  return {
    db,
    runCount: () => runCount,
    bound: () => lastBound,
  };
}

describe('parseOperatorReportDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(parseOperatorReportDate('2026-10-07')).toBe('2026-10-07');
  });
  it('rejects garbage', () => {
    expect(parseOperatorReportDate('07-10-2026')).toBeNull();
    expect(parseOperatorReportDate('')).toBeNull();
  });
});

describe('persistOperatorDailyReport', () => {
  it('retries transient D1 and writes once', async () => {
    const mock = mockD1Run(['fail', 'ok']);
    await persistOperatorDailyReport(
      { DB_CHATBOT: mock.db },
      '2026-10-07',
      '# Raport',
      'FAIL',
    );
    expect(mock.runCount()).toBe(2);
    expect(mock.bound()[0]).toBe('2026-10-07');
  });

  it('does not retry non-transient D1 errors', async () => {
    let runs = 0;
    const db = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            runs += 1;
            throw new Error('D1_ERROR: no such table: operator_daily_reports');
          },
        }),
      }),
    } as unknown as D1Database;

    await expect(
      persistOperatorDailyReport({ DB_CHATBOT: db }, '2026-10-07', '# x', 'FAIL'),
    ).rejects.toThrow(/no such table/);
    expect(runs).toBe(1);
  });
});

describe('runOperatorDailyReport', () => {
  beforeEach(() => {
    buildFlowHealthReport.mockReset();
    fetchGemmaConversations24h.mockReset();
    buildGemmaDigestMarkdown.mockReset();
    buildFlowHealthReport.mockResolvedValue(mockHealth('FAIL'));
    fetchGemmaConversations24h.mockResolvedValue([]);
    buildGemmaDigestMarkdown.mockReturnValue('## Gemma\n\n_brak_');
  });

  it('persists a single upserted row after transient D1 on persist', async () => {
    const mock = mockD1Run(['fail', 'ok']);
    const out = await runOperatorDailyReport(
      { DB_CHATBOT: mock.db },
      async () => ({ rowCount: null, skipped: true }),
      async () => ({ ok: false as const, error: 'skip' }),
      { reportDate: '2026-10-07' },
    );
    expect(out).toEqual({ reportDate: '2026-10-07', edogVerdict: 'FAIL' });
    expect(mock.runCount()).toBe(2);
    expect(mock.bound()[0]).toBe('2026-10-07');
  });

  it('odtworzenie za datę używa tej samej ścieżki co cron (reportDate + persist)', async () => {
    const mock = mockD1Run(['ok']);
    const cronOut = await runOperatorDailyReport(
      { DB_CHATBOT: mock.db },
      async () => ({ rowCount: null, skipped: true }),
      async () => ({ ok: false as const, error: 'skip' }),
      { reportDate: '2026-10-07' },
    );
    const replayOut = await runOperatorDailyReport(
      { DB_CHATBOT: mock.db },
      async () => ({ rowCount: null, skipped: true }),
      async () => ({ ok: false as const, error: 'skip' }),
      { reportDate: '2026-10-07' },
    );
    expect(cronOut).toEqual(replayOut);
    expect(mock.runCount()).toBe(2);
    expect(buildFlowHealthReport).toHaveBeenCalledTimes(2);
  });
});
