import { describe, expect, it } from 'vitest';
import { resolveActiveModel } from './openrouter-config';

describe('resolveActiveModel', () => {
  it('prefers modelOverride over state and env', () => {
    expect(
      resolveActiveModel('openai/gpt-4o', 'google/gemini-pro', 'anthropic/claude-3-opus'),
    ).toBe('openai/gpt-4o');
  });

  it('uses state when no override', () => {
    expect(resolveActiveModel(undefined, 'google/gemini-pro', 'openai/gpt-4o')).toBe(
      'google/gemini-pro',
    );
  });

  it('uses env when state is null', () => {
    expect(resolveActiveModel(undefined, null, 'openai/gpt-4o-mini')).toBe('openai/gpt-4o-mini');
  });

  it('falls back to first catalog model', () => {
    expect(resolveActiveModel(undefined, null, undefined)).toBe('meta-llama/llama-2-70b-chat');
  });

  it('ignores invalid override and env', () => {
    expect(resolveActiveModel('not-a-model' as never, null, 'also-invalid')).toBe(
      'meta-llama/llama-2-70b-chat',
    );
  });
});
