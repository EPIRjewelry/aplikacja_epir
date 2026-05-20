import { describe, it, expect } from 'vitest';
import { AVAILABLE_MODELS } from './openrouter-config';

describe('openrouter-config', () => {
  it('exports at least 3 models', () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThanOrEqual(3);
  });

  it('each model has id and label', () => {
    for (const m of AVAILABLE_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
    }
  });

  it('ModelId matches the first item id', () => {
    const first: string = AVAILABLE_MODELS[0].id;
    expect(first).toBe('meta-llama/llama-2-70b-chat');
  });
});