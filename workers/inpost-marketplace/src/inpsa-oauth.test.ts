import { afterEach, describe, expect, it, vi } from 'vitest';
import { INPSA_DEFAULT_TOKEN_TTL_SECONDS, INPSA_TOKEN_REFRESH_SKEW_MS } from './inpsa-config';
import { InpsaOAuthClient } from './inpsa-oauth';
import type { Env } from './env';

const baseEnv: Env = {
  INPSA_ENV: 'stage',
  INPSA_CLIENT_ID: 'test-client',
  INPSA_CLIENT_SECRET: 'test-secret',
};

function mockFetchToken(expiresIn = 300): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/oauth2/token')) {
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Basic /);
      const body = init?.body?.toString() ?? '';
      expect(body).toContain('grant_type=client_credentials');
      expect(body).toContain('api%3Aorders%3Aread');
      return new Response(JSON.stringify({ access_token: 'tok-abc', expires_in: expiresIn }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('InpsaOAuthClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches token with Client Credentials on stage host', async () => {
    const fetchFn = mockFetchToken();
    const client = new InpsaOAuthClient(baseEnv, fetchFn);
    const result = await client.getAccessToken();

    expect(result.accessToken).toBe('tok-abc');
    expect(result.fromCache).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain(
      'stage-account.inpost-group.com',
    );
  });

  it('reuses in-memory cache until skew window', async () => {
    const fetchFn = mockFetchToken(300);
    const client = new InpsaOAuthClient(baseEnv, fetchFn);

    const first = await client.getAccessToken();
    const second = await client.getAccessToken();

    expect(second.fromCache).toBe(true);
    expect(second.accessToken).toBe(first.accessToken);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refetches when cache is inside refresh skew', async () => {
    vi.useFakeTimers();
    const fetchFn = mockFetchToken(300);
    const client = new InpsaOAuthClient(baseEnv, fetchFn);

    try {
      await client.getAccessToken();
      // Advance into the last INPSA_TOKEN_REFRESH_SKEW_MS of the 300s TTL.
      await vi.advanceTimersByTimeAsync(300_000 - INPSA_TOKEN_REFRESH_SKEW_MS + 1);
      const again = await client.getAccessToken();

      expect(again.fromCache).toBe(false);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses default TTL when expires_in missing', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'tok-no-expiry' }), { status: 200 }),
    ) as typeof fetch;
    const client = new InpsaOAuthClient(baseEnv, fetchFn);
    const before = Date.now();
    const result = await client.getAccessToken();
    const expectedMin = before + INPSA_DEFAULT_TOKEN_TTL_SECONDS * 1000 - 1000;
    expect(result.expiresAtMs).toBeGreaterThanOrEqual(expectedMin);
  });

  it('throws when credentials missing', async () => {
    const client = new InpsaOAuthClient({ INPSA_ENV: 'stage' }, mockFetchToken());
    await expect(client.getAccessToken()).rejects.toThrow(/INPSA_CLIENT_ID/);
  });
});
