import { describe, expect, it, vi } from 'vitest';
import { buildFlowHealthReport } from './edog-flow-health-runner';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';

function capturePrepareDb(sqls: string[]): D1Database {
  const prepare = vi.fn((sql: string) => {
    sqls.push(sql);
    return {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue({
        cnt: 0,
        last_pixel_export_at: 0,
        last_pixel_export_id: '',
        last_messages_export_at: 0,
        last_orders_export_at: 0,
        last_orders_export_id: '',
        updated_at: Date.now(),
      }),
    };
  });
  return { prepare } as unknown as D1Database;
}

describe('buildFlowHealthReport', () => {
  it('applies gemmaCustomerMessagesSql to every messages query', async () => {
    const pixelSqls: string[] = [];
    const chatSqls: string[] = [];
    const env = {
      DB: capturePrepareDb(pixelSqls),
      DB_CHATBOT: capturePrepareDb(chatSqls),
      PIPELINE_PIXEL_INGEST_URL: 'https://example.invalid/pixel',
      PIPELINE_MESSAGES_INGEST_URL: 'https://example.invalid/messages',
    };

    await buildFlowHealthReport(env, async () => ({
      rowCount: null,
      skipped: true,
    }));

    const messagesSqls = chatSqls.filter((s) => /\bFROM\s+messages\b/i.test(s));
    expect(messagesSqls.length).toBeGreaterThanOrEqual(1);
    const expected = gemmaCustomerMessagesSql('m');
    for (const sql of messagesSqls) {
      expect(sql).toContain(expected);
    }
  });
});
