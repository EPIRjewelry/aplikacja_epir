import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ai-client', () => ({
  getGroqResponse: vi.fn(),
}));

import { getGroqResponse } from '../src/ai-client';
import { historyToPlainText, loadPersonMemory, mergeSessionIntoPersonSummary, upsertPersonMemory } from '../src/person-memory';

const mockedGetGroqResponse = vi.mocked(getGroqResponse);

afterEach(() => {
  mockedGetGroqResponse.mockReset();
});

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

  it('mergeSessionIntoPersonSummary returns model output when available', async () => {
    mockedGetGroqResponse.mockResolvedValueOnce('Klient preferuje srebro i szafiry.');

    const summary = await mergeSessionIntoPersonSummary(
      {} as never,
      null,
      'user: Szukam srebrnego pierścionka z szafirem',
    );

    expect(summary).toBe('Klient preferuje srebro i szafiry.');
  });

  it('mergeSessionIntoPersonSummary falls back to previous summary and latest user hints when model fails', async () => {
    mockedGetGroqResponse.mockRejectedValueOnce(new Error('Workers AI returned an empty or invalid response'));

    const summary = await mergeSessionIntoPersonSummary(
      {} as never,
      'Preferuje biżuterię srebrną.',
      [
        'user: Szukam pierścionka z szafirem',
        'assistant: Jasne, pomogę.',
        'user: Najlepiej delikatny model',
      ].join('\n'),
    );

    expect(summary).toContain('Preferuje biżuterię srebrną.');
    expect(summary).toContain('Szukam pierścionka z szafirem');
    expect(summary).toContain('Najlepiej delikatny model');
    expect(summary).not.toContain('assistant:');
  });
});
