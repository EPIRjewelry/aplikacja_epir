import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_QUERY_IDS,
  READONLY_SAFE_ANALYTICS_QUERY_IDS,
  analyticsQueryDeniedPayload,
  isReadonlyAnalyticsCredential,
  isReadonlySafeAnalyticsQueryId,
  isWhitelistedAnalyticsQueryId,
  resolveAnalyticsQueryId,
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
    expect(READONLY_SAFE_ANALYTICS_QUERY_IDS).toHaveLength(9);
    expect(ANALYTICS_QUERY_IDS).toHaveLength(10);
    expect(READONLY_SAFE_ANALYTICS_QUERY_IDS).not.toContain('Q3_TOP_CHAT_QUESTIONS');
  });

  it('resolves short Qi aliases and case variants to canonical ids', () => {
    expect(resolveAnalyticsQueryId('Q1')).toBe('Q1_CONVERSION_CHAT');
    expect(resolveAnalyticsQueryId('q10')).toBe('Q10_SESSION_DURATION');
    expect(resolveAnalyticsQueryId('q3_top_chat_questions')).toBe('Q3_TOP_CHAT_QUESTIONS');
    expect(resolveAnalyticsQueryId('SELECT_STAR')).toBe('SELECT_STAR');
  });

  it('denied payload lists readonly ids without Q3', () => {
    const body = analyticsQueryDeniedPayload(
      new Request('https://x/', { headers: { 'X-Admin-Key': 'read-only' } }),
      env,
      'queryId_not_whitelisted',
    );
    expect(body.allowedQueryIds).toEqual([...READONLY_SAFE_ANALYTICS_QUERY_IDS]);
    expect(body.allowedQueryIds).not.toContain('Q3_TOP_CHAT_QUESTIONS');
  });

  it('rejects when readonly secret unset', () => {
    expect(
      verifyAnalyticsReadAccess(new Request('https://x/', { headers: { 'X-Admin-Key': 'read-only' } }), {
        EPIR_OPERATOR_PANEL_SECRET: 'full-op',
      }),
    ).toBe(false);
  });
});
