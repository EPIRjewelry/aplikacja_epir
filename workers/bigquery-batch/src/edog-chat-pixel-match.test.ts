import { describe, expect, it, vi } from 'vitest';
import { computeChatPixelSessionMatch } from './edog-chat-pixel-match';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';

function capturePrepareDb(sqls: string[], allResult: unknown = { results: [] }): D1Database {
  const prepare = vi.fn((sql: string) => {
    sqls.push(sql);
    return {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue(allResult),
      first: vi.fn().mockResolvedValue({ cnt: 0 }),
    };
  });
  return { prepare } as unknown as D1Database;
}

describe('computeChatPixelSessionMatch', () => {
  it('applies gemmaCustomerMessagesSql to the messages query', async () => {
    const chatSqls: string[] = [];
    const pixelSqls: string[] = [];
    const chatDb = capturePrepareDb(chatSqls, { results: [] });
    const pixelDb = capturePrepareDb(pixelSqls);

    await computeChatPixelSessionMatch(pixelDb, chatDb, 1_700_000_000_000);

    const messagesSqls = chatSqls.filter((s) => /\bFROM\s+messages\b/i.test(s));
    expect(messagesSqls.length).toBeGreaterThanOrEqual(1);
    const expected = gemmaCustomerMessagesSql('m');
    for (const sql of messagesSqls) {
      expect(sql).toContain(expected);
    }
  });
});
