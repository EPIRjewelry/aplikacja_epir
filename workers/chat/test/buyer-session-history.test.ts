import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendBuyerSessionMessage,
  lastBuyerHistoryEntries,
  normalizeBuyerSessionHistory,
  readBuyerSessionHistory,
} from '../src/buyer/session-history';

describe('buyer session history', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lastBuyerHistoryEntries keeps last 8 user/assistant only', () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `m${i}`,
    }));
    const last = lastBuyerHistoryEntries(entries, 8);
    expect(last).toHaveLength(8);
    expect(last[0].content).toBe('m4');
  });

  it('readBuyerSessionHistory returns empty without SESSION_DO', async () => {
    const env = {} as import('../src/config/bindings').Env;
    const h = await readBuyerSessionHistory(env, 'sess-1');
    expect(h).toEqual([]);
  });

  it('appendBuyerSessionMessage no-ops without session_id binding', async () => {
    const env = {} as import('../src/config/bindings').Env;
    await appendBuyerSessionMessage(env, 'sess', 'user', 'hi');
    // no throw
  });

  it('normalizeBuyerSessionHistory drops tool role and empty content', () => {
    const rows = normalizeBuyerSessionHistory([
      { role: 'user', content: 'cześć' },
      { role: 'tool', content: 'secret tool payload' },
      { role: 'assistant', content: '   ' },
      { role: 'assistant', content: 'witam' },
    ]);
    expect(rows).toEqual([
      { role: 'user', content: 'cześć' },
      { role: 'assistant', content: 'witam' },
    ]);
  });

  it('readBuyerSessionHistory uses SESSION_DO stub and filters tool messages', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) {
        return new Response(
          JSON.stringify([
            { role: 'user', content: 'q' },
            { role: 'tool', content: 'ignored' },
            { role: 'assistant', content: 'a' },
          ]),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    });
    const env = {
      SESSION_DO: {
        idFromName: () => 'id',
        get: () => ({ fetch }),
      },
    } as import('../src/config/bindings').Env;
    const h = await readBuyerSessionHistory(env, 'sess-do');
    expect(h).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
