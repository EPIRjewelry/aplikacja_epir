import { describe, expect, it, vi } from 'vitest';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';
import { DEFAULT_WATERMARK, exportMessages, loadExportWatermarkResult } from './warehouse-pixel-export';

function mockDb(firstImpl: () => Promise<unknown>): D1Database {
  const prepare = vi.fn(() => ({
    first: firstImpl,
    bind: vi.fn().mockReturnThis(),
    run: vi.fn(),
    all: vi.fn(),
  }));
  return { prepare } as unknown as D1Database;
}

describe('loadExportWatermarkResult', () => {
  it('status ok when row exists', async () => {
    const db = mockDb(async () => ({
      last_pixel_export_at: 1_778_795_940_808,
      last_pixel_export_id: 'abc',
      last_messages_export_at: 0,
      last_orders_export_at: 0,
      last_orders_export_id: '',
    }));
    const r = await loadExportWatermarkResult(db);
    expect(r.status).toBe('ok');
    expect(r.watermark.last_pixel_export_at).toBe(1_778_795_940_808);
    expect(r.watermark.last_pixel_export_id).toBe('abc');
  });

  it('status missing when no row', async () => {
    const db = mockDb(async () => null);
    const r = await loadExportWatermarkResult(db);
    expect(r.status).toBe('missing');
    expect(r.watermark.last_pixel_export_at).toBe(0);
  });

  it('status read_error when both SELECTs throw', async () => {
    const prepare = vi.fn(() => ({
      first: vi.fn().mockRejectedValue(new Error('d1 down')),
      bind: vi.fn().mockReturnThis(),
    }));
    const db = { prepare } as unknown as D1Database;
    const r = await loadExportWatermarkResult(db);
    expect(r.status).toBe('read_error');
    expect(r.watermark.last_pixel_export_at).toBe(0);
  });
});

describe('exportMessages', () => {
  it('applies gemmaCustomerMessagesSql and parenthesizes cursor OR', async () => {
    const sqls: string[] = [];
    const prepare = vi.fn((sql: string) => {
      sqls.push(sql);
      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn(),
      };
    });
    const chatDb = { prepare } as unknown as D1Database;
    const pixelDb = mockDb(async () => null);

    await exportMessages(
      {
        DB: pixelDb,
        DB_CHATBOT: chatDb,
        PIPELINE_MESSAGES_INGEST_URL: 'https://example.invalid/messages',
      },
      { ...DEFAULT_WATERMARK },
      10,
    );

    const messagesSqls = sqls.filter((s) => /\bFROM\s+messages\b/i.test(s));
    expect(messagesSqls.length).toBe(1);
    const sql = messagesSqls[0]!;
    expect(sql).toContain(gemmaCustomerMessagesSql('m'));
    expect(sql).toMatch(
      /\(m\.timestamp\s*>\s*\?1\s+OR\s+\(m\.timestamp\s*=\s*\?1\s+AND\s+CAST\(m\.id\s+AS\s+INTEGER\)\s*>\s*\?2\)\)/,
    );
  });
});
