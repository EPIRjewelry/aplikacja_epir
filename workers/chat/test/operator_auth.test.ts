import { describe, expect, it } from 'vitest';
import {
  isReadonlyAnalyticsCredential,
  isReadonlySafeAnalyticsQueryId,
  isWhitelistedAnalyticsQueryId,
  verifyAnalyticsReadAccess,
  verifyOperatorPanelKey,
} from '../src/operator/operator-auth';

describe('operator-auth', () => {
  const env = {
    EPIR_OPERATOR_PANEL_SECRET: 'full-op',
    EPIR_READONLY_ANALYTICS_KEY: 'read-only',
  };

  it('verifyOperatorPanelKey accepts only full secret', () => {
    expect(
      verifyOperatorPanelKey(
        new Request('https://x/', { headers: { 'X-Admin-Key': 'full-op' } }),
        env,
      ),
    ).toBe(true);
    expect(
      verifyOperatorPanelKey(
        new Request('https://x/', { headers: { 'X-Admin-Key': 'read-only' } }),
        env,
      ),
    ).toBe(false);
  });

  it('verifyAnalyticsReadAccess accepts full or readonly key', () => {
    expect(
      verifyAnalyticsReadAccess(
        new Request('https://x/', { headers: { 'X-Admin-Key': 'full-op' } }),
        env,
      ),
    ).toBe(true);
    expect(
      verifyAnalyticsReadAccess(
        new Request('https://x/', { headers: { 'X-Admin-Key': 'read-only' } }),
        env,
      ),
    ).toBe(true);
    expect(
      verifyAnalyticsReadAccess(
        new Request('https://x/', { headers: { Authorization: 'Bearer read-only' } }),
        env,
      ),
    ).toBe(true);
    expect(
      verifyAnalyticsReadAccess(
        new Request('https://x/', { headers: { 'X-Admin-Key': 'wrong' } }),
        env,
      ),
    ).toBe(false);
  });

  it('isReadonlyAnalyticsCredential is true only for readonly key', () => {
    expect(
      isReadonlyAnalyticsCredential(
        new Request('https://x/', { headers: { 'X-Admin-Key': 'read-only' } }),
        env,
      ),
    ).toBe(true);
    expect(
      isReadonlyAnalyticsCredential(
        new Request('https://x/', { headers: { 'X-Admin-Key': 'full-op' } }),
        env,
      ),
    ).toBe(false);
  });

  it('Q3 is whitelisted but not readonly-safe', () => {
    expect(isWhitelistedAnalyticsQueryId('Q3_TOP_CHAT_QUESTIONS')).toBe(true);
    expect(isReadonlySafeAnalyticsQueryId('Q3_TOP_CHAT_QUESTIONS')).toBe(false);
    expect(isReadonlySafeAnalyticsQueryId('Q1_CONVERSION_CHAT')).toBe(true);
    expect(isWhitelistedAnalyticsQueryId('SELECT * FROM x')).toBe(false);
  });

  it('rejects when readonly secret unset', () => {
    expect(
      verifyAnalyticsReadAccess(new Request('https://x/', { headers: { 'X-Admin-Key': 'read-only' } }), {
        EPIR_OPERATOR_PANEL_SECRET: 'full-op',
      }),
    ).toBe(false);
  });
});
