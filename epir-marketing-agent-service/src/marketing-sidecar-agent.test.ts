import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveActiveModel } from './openrouter-config';

vi.mock('./openrouter-client', () => {
  return {
    OpenRouterClient: class {
      static listModels() {
        return [{ id: 'google/gemini-pro', label: 'Gemini Pro' }];
      }
      chat = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'assistant reply' } }],
        model: 'google/gemini-pro',
      });
    },
  };
});

describe('MarketingSidecarAgent model resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveActiveModel: override beats state beats env', () => {
    expect(
      resolveActiveModel('openai/gpt-4o', 'google/gemini-pro', 'anthropic/claude-3-opus'),
    ).toBe('openai/gpt-4o');
    expect(resolveActiveModel(undefined, 'google/gemini-pro', 'openai/gpt-4o')).toBe(
      'google/gemini-pro',
    );
    expect(resolveActiveModel(undefined, null, 'openai/gpt-4o-mini')).toBe('openai/gpt-4o-mini');
  });
});
