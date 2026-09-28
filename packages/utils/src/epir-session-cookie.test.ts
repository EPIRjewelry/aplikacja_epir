import { describe, expect, it } from 'vitest';
import {
  readEpirSessionIdFromCookieHeader,
  readShopifyYFromCookieHeader,
  resolveEpirAnalyticsSessionId,
  resolveEpirAnalyticsSessionIdFromCookieHeader,
} from './epir-session-cookie';

describe('readEpirSessionIdFromCookieHeader', () => {
  it('reads _epir_session_id', () => {
    expect(
      readEpirSessionIdFromCookieHeader('_epir_session_id=abc%20123; other=1'),
    ).toBe('abc 123');
  });

  it('returns null when missing', () => {
    expect(readEpirSessionIdFromCookieHeader('foo=bar')).toBeNull();
  });
});

describe('resolveEpirAnalyticsSessionId (pixel + cart attr SSOT)', () => {
  it('prefers _epir_session_id over _shopify_y', () => {
    expect(
      resolveEpirAnalyticsSessionId({
        epirSessionId: 'epir-from-cookie',
        shopifyY: 'shopify-y-token',
      }),
    ).toEqual({ sessionId: 'epir-from-cookie', shouldSetEpirCookie: false });
  });

  it('falls back to _shopify_y (Web Pixel clientId) and flags cookie write', () => {
    expect(
      resolveEpirAnalyticsSessionId({
        epirSessionId: null,
        shopifyY: 'y-client-id-xyz',
      }),
    ).toEqual({ sessionId: 'y-client-id-xyz', shouldSetEpirCookie: true });
  });

  it('does not invent an id when both cookies are empty', () => {
    expect(resolveEpirAnalyticsSessionId({ epirSessionId: '  ', shopifyY: '' })).toEqual({
      sessionId: null,
      shouldSetEpirCookie: false,
    });
  });

  it('parses Cookie header like apex snippet / cart action', () => {
    expect(
      resolveEpirAnalyticsSessionIdFromCookieHeader(
        '_shopify_y=native-y; path=/; _epir_session_id=pinned',
      ),
    ).toEqual({ sessionId: 'pinned', shouldSetEpirCookie: false });

    expect(readShopifyYFromCookieHeader('_shopify_y=native-y%2Ftoken')).toBe('native-y/token');

    expect(
      resolveEpirAnalyticsSessionIdFromCookieHeader('_shopify_y=only-y; other=1'),
    ).toEqual({ sessionId: 'only-y', shouldSetEpirCookie: true });
  });
});
