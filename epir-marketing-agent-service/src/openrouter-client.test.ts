import { describe, it, expect, vi } from 'vitest';
import { OpenRouterClient } from './openrouter-client';
import type { Env } from './env';

vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'mock answer' } }],
    model: 'mock-model',
  });
  return {
    default: class {
      chat = { completions: { create: mockCreate } };
    },
  };
});

function makeEnv(overrides?: Partial<Env>): Env {
  return {
    MarketingSidecarAgent: {} as any,
    MARKETING_INGEST_ORIGIN: 'https://example.com',
    MARKETING_OPS_BEARER_TOKEN: 'test-token',
    OPENROUTER_API_KEY: 'sk-or-test',
    OPENROUTER_DEFAULT_MODEL: undefined,
    ...overrides,
  };
}

describe('OpenRouterClient', () => {
  it('creates instance with default model', () => {
    const client = new OpenRouterClient(makeEnv());
    expect(client).toBeInstanceOf(OpenRouterClient);
  });

  it('listModels returns AVAILABLE_MODELS', () => {
    const models = OpenRouterClient.listModels();
    expect(models.length).toBeGreaterThanOrEqual(3);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('label');
  });

  it('uses default model when no override', async () => {
    const env = makeEnv({ OPENROUTER_DEFAULT_MODEL: 'google/gemini-pro' });
    const client = new OpenRouterClient(env);
    const resp = await client.chat([{ role: 'user', content: 'test' }]);
    expect(resp.model).toBe('mock-model');
  });

  it('uses override model when provided', async () => {
    const client = new OpenRouterClient(makeEnv());
    const resp = await client.chat([{ role: 'user', content: 'test' }], 'google/gemini-pro');
    expect(resp.model).toBe('mock-model');
  });

  it('falls back to first model when env not set', () => {
    const client = new OpenRouterClient(makeEnv({ OPENROUTER_DEFAULT_MODEL: undefined }));
    expect(client).toBeInstanceOf(OpenRouterClient);
  });
});