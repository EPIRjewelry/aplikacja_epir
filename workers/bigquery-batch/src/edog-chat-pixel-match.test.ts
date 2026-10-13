import { describe, expect, it, vi } from 'vitest';
import {
  aggregateChatPixelSessionMatch,
  computeChatPixelSessionMatch,
} from './edog-chat-pixel-match';
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

/** Sklepowe sesje po filtrze Gemma (operator / internal-dashboard odrzucone w SQL). */
const STOREFRONT_CONSENT_ROWS = [
  { session_id: 'shop-match', analytics_consent: 1 },
  { session_id: 'shop-miss', analytics_consent: 1 },
  { session_id: 'sess_no_consent', analytics_consent: 0 },
] as const;

describe('aggregateChatPixelSessionMatch', () => {
  it('counts consented denominator only (3 total, 2 consented, 1 matched → 50%)', () => {
    const matched = new Set(['shop-match']);
    const stats = aggregateChatPixelSessionMatch([...STOREFRONT_CONSENT_ROWS], matched);
    expect(stats.chat_sessions_total).toBe(3);
    expect(stats.chat_sessions_24h).toBe(3);
    expect(stats.chat_sessions_consented).toBe(2);
    expect(stats.chat_sessions_matched).toBe(1);
    expect(stats.chat_pixel_session_match_rate).toBe(0.5);
  });

  it('old total-based rate would be 1/3 — not 50%', () => {
    const matched = new Set(['shop-match']);
    const legacyRate = matched.size / STOREFRONT_CONSENT_ROWS.length;
    const stats = aggregateChatPixelSessionMatch([...STOREFRONT_CONSENT_ROWS], matched);
    expect(legacyRate).not.toBe(stats.chat_pixel_session_match_rate);
    expect(legacyRate).toBeCloseTo(1 / 3);
  });

  it('returns null rate when no consented sessions', () => {
    const rows = [
      { session_id: 'unknown-a', analytics_consent: null },
      { session_id: 'denied-b', analytics_consent: 0 },
    ];
    const stats = aggregateChatPixelSessionMatch(rows, new Set());
    expect(stats.chat_sessions_total).toBe(2);
    expect(stats.chat_sessions_consented).toBe(0);
    expect(stats.chat_pixel_session_match_rate).toBeNull();
  });
});

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
    expect(messagesSqls[0]).toMatch(/sessions\s+s\s+ON/i);
  });

  it('queries pixel only for consented session ids', async () => {
    const chatDb = capturePrepareDb([], { results: [...STOREFRONT_CONSENT_ROWS] });
    const pixelSqls: string[] = [];
    const pixelDb = capturePrepareDb(pixelSqls, {
      results: [{ session_id: 'shop-match' }],
    });

    const stats = await computeChatPixelSessionMatch(pixelDb, chatDb, 1_700_000_000_000);
    expect(stats.chat_pixel_session_match_rate).toBe(0.5);
    const pixelQuery = pixelSqls.find((s) => /pixel_events/i.test(s));
    expect(pixelQuery).toBeDefined();
    expect(pixelQuery).toMatch(/\?1,\s*\?2/);
    expect(pixelQuery).not.toContain('sess_no_consent');
  });
});
