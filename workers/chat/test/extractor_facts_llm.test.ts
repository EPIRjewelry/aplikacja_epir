import { describe, expect, it, vi } from 'vitest';
import { EXTRACTOR_LLM_MAX_TOKENS, EXTRACTOR_LLM_MODEL_ID } from '../src/config/model-params';

const getGroqResponse = vi.fn();

vi.mock('../src/ai-client', () => ({
  getGroqResponse: (...args: unknown[]) => getGroqResponse(...args),
}));

import { extractFactsLLM } from '../src/memory/extractor';

describe('extractFactsLLM', () => {
  it('calls getGroqResponse with extractor max_tokens and GLM model id', async () => {
    getGroqResponse.mockResolvedValueOnce(
      '[{"slot":"intent","value":"browsing","confidence":0.8}]',
    );
    const env = { AI: { run: vi.fn() } };

    await extractFactsLLM(env, ['coś wystarczająco długiego żeby przejść próg'], {});

    expect(getGroqResponse).toHaveBeenCalled();
    const opts = getGroqResponse.mock.calls[0]?.[2] as {
      max_tokens?: number;
      modelId?: string;
    };
    expect(opts?.max_tokens).toBe(EXTRACTOR_LLM_MAX_TOKENS);
    expect(opts?.modelId).toBe(EXTRACTOR_LLM_MODEL_ID);
    expect(opts?.forMemory).toBe(true);
  });
});
