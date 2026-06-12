import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetOpenRouterCatalogCacheForTests,
  catalogEntryToCapabilities,
  fetchOpenRouterCatalog,
  findCatalogEntry,
  isValidOpenRouterModelId,
} from '../src/openrouter-catalog';
describe('openrouter-catalog', () => {
  beforeEach(() => {
    __resetOpenRouterCatalogCacheForTests();
  });

  it('isValidOpenRouterModelId accepts provider/model slugs', () => {
    expect(isValidOpenRouterModelId('anthropic/claude-sonnet-4')).toBe(true);
    expect(isValidOpenRouterModelId('meta-llama/llama-3.1-8b-instruct:free')).toBe(true);
    expect(isValidOpenRouterModelId('openai/gpt-4o:beta')).toBe(true);
    expect(isValidOpenRouterModelId('openrouter/foo')).toBe(false);
    expect(isValidOpenRouterModelId('')).toBe(false);
  });

  it('catalogEntryToCapabilities prefixes openrouter/', () => {
    const cap = catalogEntryToCapabilities({
      id: 'recraft/recraft-v4.1',
      name: 'Recraft',
      multimodal: true,
      imageGen: true,
      contextLength: null,
    });
    expect(cap.id).toBe('openrouter/recraft/recraft-v4.1');
    expect(cap.imageGen).toBe(true);
  });

  it('fetchOpenRouterCatalog caches successful response', async () => {
    const payload = {
      data: [
        {
          id: 'openai/gpt-4o',
          name: 'GPT-4o',
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
        },
        {
          id: 'recraft/recraft-v4.1',
          name: 'Recraft',
          architecture: { output_modalities: ['image'] },
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchOpenRouterCatalog('sk-test');
    expect(first).toHaveLength(2);
    expect(findCatalogEntry(first, 'openai/gpt-4o')?.multimodal).toBe(true);

    await fetchOpenRouterCatalog('sk-test');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});

// parseModelsPayload is not exported — test via fetch only above
