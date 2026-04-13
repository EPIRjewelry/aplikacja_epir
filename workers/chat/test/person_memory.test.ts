import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ai-client', () => ({
  getGroqResponse: vi.fn(),
}));

import { getGroqResponse } from '../src/ai-client';
import {
  historyToPlainText,
  loadPersonMemory,
  loadPersonMemoryRecord,
  mergeSessionIntoPersonSummary,
  upsertPersonMemory,
  upsertPersonMemoryVersioned,
} from '../src/person-memory';

const mockedGetGroqResponse = vi.mocked(getGroqResponse);

type PersonMemoryRow = {
  shopify_customer_id: string;
  summary: string;
  updated_at: number;
  version: number;
  last_updated_by_request_id: string | null;
};

function makePersonMemoryDb(initialRow?: Partial<PersonMemoryRow>) {
  let row: PersonMemoryRow | null = initialRow
    ? {
        shopify_customer_id: initialRow.shopify_customer_id ?? 'gid://shopify/Customer/1',
        summary: initialRow.summary ?? 'summary text',
        updated_at: initialRow.updated_at ?? 100,
        version: initialRow.version ?? 0,
        last_updated_by_request_id: initialRow.last_updated_by_request_id ?? null,
      }
    : null;

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (!row) return null;
              if (sql.includes('SELECT shopify_customer_id, summary, updated_at, version, last_updated_by_request_id')) {
                return {
                  shopify_customer_id: row.shopify_customer_id,
                  summary: row.summary,
                  updated_at: row.updated_at,
                  version: row.version,
                  last_updated_by_request_id: row.last_updated_by_request_id,
                };
              }
              if (sql.includes('SELECT summary FROM person_memory')) {
                return { summary: row.summary };
              }
              throw new Error(`Unsupported first() SQL in test: ${sql}`);
            },
            async run() {
              if (!sql.includes('INSERT INTO person_memory')) {
                throw new Error(`Unsupported run() SQL in test: ${sql}`);
              }

              const [shopifyCustomerId, summary, updatedAt, nextVersion, requestId, expectedVersion] = args;
              if (!row) {
                row = {
                  shopify_customer_id: String(shopifyCustomerId),
                  summary: String(summary ?? ''),
                  updated_at: Number(updatedAt),
                  version: Number(nextVersion),
                  last_updated_by_request_id: typeof requestId === 'string' ? requestId : null,
                };
                return { success: true, meta: { changes: 1 } };
              }

              if (row.version !== Number(expectedVersion)) {
                return { success: true, meta: { changes: 0 } };
              }

              row = {
                shopify_customer_id: String(shopifyCustomerId),
                summary: String(summary ?? ''),
                updated_at: Number(updatedAt),
                version: Number(nextVersion),
                last_updated_by_request_id: typeof requestId === 'string' ? requestId : null,
              };
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return {
    db,
    getRow: () => (row ? { ...row } : null),
  };
}

afterEach(() => {
  mockedGetGroqResponse.mockReset();
});

describe('person_memory helpers', () => {
  it('historyToPlainText keeps user/assistant and respects maxChars', () => {
    const text = historyToPlainText(
      [
        { role: 'system', content: 'x' },
        { role: 'user', content: 'Szukam srebrnego pierścionka z opalem' },
        { role: 'assistant', content: 'Mam kilka propozycji w stylu minimalistycznym' },
      ],
      100,
    );
    expect(text).toContain('user: Szukam srebrnego pierścionka z opalem');
    expect(text).toContain('assistant: Mam kilka propozycji w stylu minimalistycznym');
    expect(text).not.toContain('system');
  });

  it('loadPersonMemory returns null when row missing', async () => {
    const { db } = makePersonMemoryDb();
    const r = await loadPersonMemory(db, 'gid://shopify/Customer/1');
    expect(r).toBeNull();
  });

  it('loadPersonMemoryRecord returns version metadata', async () => {
    const { db } = makePersonMemoryDb({
      summary: 'Klient preferuje srebro.',
      version: 4,
      last_updated_by_request_id: 'req-4',
      updated_at: 444,
    });

    const record = await loadPersonMemoryRecord(db, 'gid://shopify/Customer/1');

    expect(record).toEqual({
      shopifyCustomerId: 'gid://shopify/Customer/1',
      summary: 'Klient preferuje srebro.',
      updatedAt: 444,
      version: 4,
      lastUpdatedByRequestId: 'req-4',
    });
  });

  it('upsertPersonMemory creates first version via versioned helper', async () => {
    const { db, getRow } = makePersonMemoryDb();

    await upsertPersonMemory(db, 'gid://shopify/Customer/1', 'summary text');

    const row = getRow();
    expect(row?.summary).toBe('summary text');
    expect(row?.version).toBe(1);
    expect(row?.last_updated_by_request_id).toMatch(/^legacy:/);
  });

  it('upsertPersonMemoryVersioned creates row and increments version', async () => {
    const { db } = makePersonMemoryDb();

    const result = await upsertPersonMemoryVersioned(db, {
      shopifyCustomerId: 'gid://shopify/Customer/1',
      summary: 'Klient preferuje srebro i opale.',
      expectedVersion: 0,
      requestId: 'req-1',
    });

    expect(result.status).toBe('created');
    if (result.status === 'conflict') throw new Error('unexpected conflict');
    expect(result.record.version).toBe(1);
    expect(result.record.lastUpdatedByRequestId).toBe('req-1');
  });

  it('upsertPersonMemoryVersioned reports version conflict for stale writes', async () => {
    const { db } = makePersonMemoryDb({
      summary: 'Klient preferuje złoto.',
      version: 3,
      last_updated_by_request_id: 'req-3',
      updated_at: 333,
    });

    const result = await upsertPersonMemoryVersioned(db, {
      shopifyCustomerId: 'gid://shopify/Customer/1',
      summary: 'Klient preferuje białe złoto.',
      expectedVersion: 2,
      requestId: 'req-stale',
    });

    expect(result.status).toBe('conflict');
    expect(result.record?.version).toBe(3);
    expect(result.record?.summary).toBe('Klient preferuje złoto.');
  });

  it('upsertPersonMemoryVersioned treats same request id as idempotent replay', async () => {
    const { db } = makePersonMemoryDb({
      summary: 'Klient preferuje szafiry.',
      version: 2,
      last_updated_by_request_id: 'req-2',
      updated_at: 222,
    });

    const result = await upsertPersonMemoryVersioned(db, {
      shopifyCustomerId: 'gid://shopify/Customer/1',
      summary: 'Klient preferuje szafiry.',
      expectedVersion: 1,
      requestId: 'req-2',
    });

    expect(result.status).toBe('idempotent');
    if (result.status === 'conflict') throw new Error('unexpected conflict');
    expect(result.record.version).toBe(2);
    expect(result.record.lastUpdatedByRequestId).toBe('req-2');
  });

  it('mergeSessionIntoPersonSummary returns model output when available', async () => {
    mockedGetGroqResponse.mockResolvedValueOnce('Klient preferuje srebro i szafiry.');

    const summary = await mergeSessionIntoPersonSummary(
      {} as never,
      null,
      'user: Szukam srebrnego pierścionka z szafirem',
    );

    expect(summary).toBe('Klient preferuje srebro i szafiry.');
  });

  it('mergeSessionIntoPersonSummary throws when model returns empty or invalid output', async () => {
    mockedGetGroqResponse.mockResolvedValueOnce('');
    mockedGetGroqResponse.mockResolvedValueOnce('   ');

    await expect(
      mergeSessionIntoPersonSummary(
        {} as never,
        'Preferuje biżuterię srebrną.',
        [
          'user: Szukam pierścionka z szafirem',
          'assistant: Jasne, pomogę.',
          'user: Najlepiej delikatny model',
        ].join('\n'),
      ),
    ).rejects.toThrow('Workers AI returned an empty or invalid response');
  });
});
