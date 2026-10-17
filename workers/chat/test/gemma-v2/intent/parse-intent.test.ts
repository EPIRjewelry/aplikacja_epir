/**
 * E3 intent parse — mutacje M-E3-4 (safety) dotyczy machine, nie parse.
 */
import {describe, expect, it} from 'vitest';
import {parseIntentJson} from '../../../src/gemma/intent/parse-intent';
import {fictionalGemmaIntentJson} from '../fixtures/gemma-intent';

describe('E3 parseIntentJson', () => {
  it('T-E3-INTENT-1: strict fixture JSON parses', () => {
    const out = parseIntentJson(fictionalGemmaIntentJson());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.intent.safety).toBe('ok');
      expect(out.intent.state).toBe('powitanie');
    }
  });

  it('T-E3-INTENT-2: missing safety field fails validation', () => {
    const raw = JSON.parse(fictionalGemmaIntentJson()) as Record<string, unknown>;
    delete raw.safety;
    const out = parseIntentJson(JSON.stringify(raw));
    expect(out.ok).toBe(false);
  });

  it('T-E3-INTENT-2b: invalid slots type fails', () => {
    const out = parseIntentJson(
      fictionalGemmaIntentJson({
        slots: {budget: 123 as unknown as string},
      }),
    );
    expect(out.ok).toBe(false);
  });
});
