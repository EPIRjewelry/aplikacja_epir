import { describe, expect, it } from 'vitest';
import {
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

  it('rejects when readonly secret unset and only full would match missing', () => {
    expect(
      verifyAnalyticsReadAccess(new Request('https://x/', { headers: { 'X-Admin-Key': 'read-only' } }), {
        EPIR_OPERATOR_PANEL_SECRET: 'full-op',
      }),
    ).toBe(false);
  });
});
