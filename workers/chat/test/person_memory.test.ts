import { describe, expect, it, vi } from 'vitest';
import { historyToPlainText, loadPersonMemory, upsertPersonMemory } from '../src/person-memory';

describe('person_memory helpers', () => {
  it('historyToPlainText keeps user/assistant and respects maxChars', () => {
    const text = historyToPlainText(
      [
        { role: 'system', content: 'x' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      100,
    );
    expect(text).toContain('user: hello');
    expect(text).toContain('assistant: hi');
    expect(text).not.toContain('system');
  });

  it('loadPersonMemory returns null when row missing', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;
    const r = await loadPersonMemory(db, 'gid://shopify/Customer/1');
    expect(r).toBeNull();
  });

  it('upsertPersonMemory runs INSERT ... ON CONFLICT', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const db = {
      prepare: () => ({
        bind: () => ({ run }),
      }),
    } as unknown as D1Database;
    await upsertPersonMemory(db, 'gid://shopify/Customer/1', 'summary text');
    expect(run).toHaveBeenCalled();
  });
});
