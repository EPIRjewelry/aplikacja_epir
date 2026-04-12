import { describe, expect, it, vi, afterEach } from 'vitest';
import { getGroqResponse, type GroqMessage } from '../src/ai-client';

const messages: GroqMessage[] = [{ role: 'user', content: 'Cześć' }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getGroqResponse polymorphic parsing', () => {
  it('returns direct response field when available', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ response: 'Płaska odpowiedź.' }),
      },
    };

    await expect(getGroqResponse(messages, env)).resolves.toBe('Płaska odpowiedź.');
  });

  it('returns content from Kimi-style choices.message.content', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Odpowiedź z choices.message.content' } }],
          model: '@cf/moonshotai/kimi-k2.5',
        }),
      },
    };

    await expect(getGroqResponse(messages, env)).resolves.toBe('Odpowiedź z choices.message.content');
  });

  it('returns joined text from array content parts', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: [
                  { type: 'text', text: 'Pierwsza część. ' },
                  { type: 'text', text: 'Druga część.' },
                ],
              },
            },
          ],
        }),
      },
    };

    await expect(getGroqResponse(messages, env)).resolves.toBe('Pierwsza część. Druga część.');
  });

  it('throws on invalid response shape', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ usage: { prompt_tokens: 1 } }),
      },
    };

    await expect(getGroqResponse(messages, env)).rejects.toThrow(
      'Workers AI returned an empty or invalid response',
    );
  });
});