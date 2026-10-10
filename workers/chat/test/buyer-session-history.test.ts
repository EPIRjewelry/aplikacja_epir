import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendBuyerSessionMessage,
  lastBuyerHistoryEntries,
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
});
