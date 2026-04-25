import { describe, expect, it, vi, afterEach } from 'vitest';
import { getGroqResponse, type GroqMessage } from '../src/ai-client';
import { EXTRACTOR_LLM_MAX_TOKENS } from '../src/config/model-params';

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

  it('returns content from legacy choices.text shape', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [{ text: 'Odpowiedź z legacy choices.text' }],
          model: '@cf/moonshotai/kimi-k2.5',
        }),
      },
    };

    await expect(getGroqResponse(messages, env)).resolves.toBe('Odpowiedź z legacy choices.text');
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

  it('forMemory: uses reasoning_content when message.content is null', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: null,
                reasoning_content: 'Myślę… [{"slot":"intent","value":"browsing","confidence":0.8}]',
              },
              finish_reason: 'length',
            },
          ],
        }),
      },
    };

    await expect(getGroqResponse(messages, env, { forMemory: true, modelId: '@cf/x/y' })).resolves.toBe(
      '[{"slot":"intent","value":"browsing","confidence":0.8}]',
    );
  });

  it('forMemory: empty body returns without throwing; warns, no error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = {
      AI: {
        run: vi
          .fn()
          .mockResolvedValue({ choices: [{ message: { content: null }, finish_reason: 'length' }] }),
      },
    };

    await expect(getGroqResponse(messages, env, { forMemory: true, modelId: '@cf/x/y' })).resolves.toBe(
      '',
    );
    expect(err).not.toHaveBeenCalled();
  });

  it('forMemory: ai.run throws returns empty string', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = {
      AI: { run: vi.fn().mockRejectedValue(new Error('bind')) },
    };

    await expect(
      getGroqResponse(messages, env, { forMemory: true, modelId: '@cf/x/y' }),
    ).resolves.toBe('');
    expect(err).not.toHaveBeenCalled();
  });

  it('returns top-level output_text when present', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ output_text: '  z output_text.  ' }),
      },
    };

    await expect(getGroqResponse(messages, env)).resolves.toBe('z output_text.');
  });

  it('uses overridden modelId when provided', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'OK' });
    const env = {
      AI: {
        run,
      },
    };

    await expect(
      getGroqResponse(messages, env, { modelId: '@cf/zai-org/glm-4.7-flash' }),
    ).resolves.toBe('OK');

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('@cf/zai-org/glm-4.7-flash');
  });

  it('passes max_tokens when provided (e.g. extractor budget)', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'x' });
    const env = { AI: { run } };

    await getGroqResponse(messages, env, {
      modelId: '@cf/zai-org/glm-4.7-flash',
      max_tokens: EXTRACTOR_LLM_MAX_TOKENS,
    });

    expect((run.mock.calls[0]?.[1] as { max_tokens?: number })?.max_tokens).toBe(
      EXTRACTOR_LLM_MAX_TOKENS,
    );
  });
});
