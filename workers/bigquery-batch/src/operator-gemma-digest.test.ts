import { describe, expect, it, vi } from 'vitest';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';
import { buildGemmaDigestMarkdown, fetchGemmaConversations24h } from './operator-gemma-digest';

describe('buildGemmaDigestMarkdown', () => {
  it('renders who and topic', () => {
    const md = buildGemmaDigestMarkdown(
      [
        {
          session_id: 'sess-abc123',
          customer_id: 'gid://shopify/Customer/1',
          first_name: 'Anna',
          last_name: 'Kowalska',
          storefront_id: 'kazka',
          user_excerpt: 'Szukam pierścionka zaręczynowego z szafirem',
          assistant_excerpt: 'Chętnie pomogę dobrać pierścionek…',
          last_ts: Date.now(),
        },
      ],
      '2026-06-17',
    );
    expect(md).toContain('Anna Kowalska');
    expect(md).toContain('kazka');
    expect(md).toContain('szafirem');
    expect(md).toContain('Gemma');
  });
});

describe('fetchGemmaConversations24h', () => {
  it('applies gemmaCustomerMessagesSql to every messages query', async () => {
    const sqls: string[] = [];
    let sessionListCalls = 0;
    const prepare = vi.fn((sql: string) => {
      sqls.push(sql);
      const isSessionsMeta = /\bFROM\s+sessions\b/i.test(sql) && !/\bNOT EXISTS\b/i.test(sql);
      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockImplementation(async () => {
          sessionListCalls += 1;
          return { results: sessionListCalls === 1 ? [{ session_id: 'sess-1' }] : [] };
        }),
        first: vi.fn().mockImplementation(async () => {
          if (isSessionsMeta) {
            return {
              customer_id: null,
              first_name: null,
              last_name: null,
              storefront_id: 'online-store',
            };
          }
          if (/\brole\s*=\s*'user'/i.test(sql) || /m\.role\s*=\s*'user'/i.test(sql)) {
            return { content: 'hello', timestamp: 1_700_000_000_100 };
          }
          return { content: 'hi' };
        }),
      };
    });
    const db = { prepare } as unknown as D1Database;

    await fetchGemmaConversations24h({ DB_CHATBOT: db }, 1_700_000_000_000, 5);

    const messagesSqls = sqls.filter((s) => /\bFROM\s+messages\b/i.test(s));
    expect(messagesSqls.length).toBe(3);
    const expected = gemmaCustomerMessagesSql('m');
    for (const sql of messagesSqls) {
      expect(sql).toContain(expected);
    }
  });
});
