import {describe, expect, it, vi} from 'vitest';
import {
  extractPreferencesConsentFromBody,
  isBuyerLongTermMemoryAllowed,
  loadBuyerCrossSessionMemorySummary,
  resolvePreferencesConsentFromBody,
} from '../src/buyer/buyer-long-term-memory';

vi.mock('../src/person-memory', () => ({
  loadPersonMemory: vi.fn(async () => 'summary-from-db'),
}));

import {loadPersonMemory} from '../src/person-memory';

describe('buyer preferences consent (handleBuyerTurn path)', () => {
  it('resolvePreferencesConsentFromBody: missing field → 0', () => {
    expect(resolvePreferencesConsentFromBody({})).toBe(0);
    expect(resolvePreferencesConsentFromBody({message: 'hi'})).toBe(0);
  });

  it('extractPreferencesConsentFromBody: true/false only', () => {
    expect(extractPreferencesConsentFromBody({preferences_consent: true})).toBe(1);
    expect(extractPreferencesConsentFromBody({preferences_consent: false})).toBe(0);
    expect(extractPreferencesConsentFromBody({preferences_consent: 'yes'})).toBeUndefined();
  });

  it('isBuyerLongTermMemoryAllowed only when preferences=1', () => {
    expect(isBuyerLongTermMemoryAllowed(1)).toBe(true);
    expect(isBuyerLongTermMemoryAllowed(0)).toBe(false);
    expect(isBuyerLongTermMemoryAllowed(undefined)).toBe(false);
  });

  it('loadBuyerCrossSessionMemorySummary skips D1 when preferences=0', async () => {
    const env = {DB_CHATBOT: {}} as import('../src/config/bindings').Env;
    const out = await loadBuyerCrossSessionMemorySummary(env, 'gid://shopify/Customer/1', 0);
    expect(out).toBeNull();
    expect(loadPersonMemory).not.toHaveBeenCalled();
  });

  it('loadBuyerCrossSessionMemorySummary reads when preferences=1', async () => {
    const env = {DB_CHATBOT: {}} as import('../src/config/bindings').Env;
    const out = await loadBuyerCrossSessionMemorySummary(env, 'gid://shopify/Customer/1', 1);
    expect(out).toBe('summary-from-db');
    expect(loadPersonMemory).toHaveBeenCalled();
  });
});
