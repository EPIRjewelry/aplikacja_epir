import { describe, expect, it, vi } from 'vitest';
import { countOrderEvents, InpsaApiClient } from './inpsa-api';
import type { Env } from './env';

const env: Env = {
  INPSA_ENV: 'stage',
  INPSA_CLIENT_ID: 'cid',
  INPSA_CLIENT_SECRET: 'csec',
  INPSA_ORGANIZATION_ID: 'org-merchant-1',
};

describe('InpsaApiClient', () => {
  it('fetchOrdersEvents attaches bearer token and query params', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'access-1', expires_in: 300 }), { status: 200 });
      }
      if (url.includes('/inpsa/v1/organizations/org-merchant-1/orders/events')) {
        expect(url).toContain('limit=5');
        expect(url).toContain('untilId=evt-9');
        expect(url).not.toContain('cursor=');
        return new Response(
          JSON.stringify({ data: [{ id: 'e1', order: { id: 'VH-1' }, orderEventType: 'ACCEPTED' }] }),
          { status: 200 },
        );
      }
      return new Response('nope', { status: 500 });
    }) as typeof fetch;

    const client = new InpsaApiClient(env, fetchFn);
    const result = await client.fetchOrdersEvents({ limit: 5, untilId: 'evt-9' });

    expect(result.status).toBe(200);
    expect(result.body?.data).toHaveLength(1);
    const ordersCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('orders/events'),
    );
    expect(ordersCall).toBeTruthy();
    const headers = ordersCall![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-1');
  });

  it('fails clearly when INPSA_ORGANIZATION_ID is missing', async () => {
    const client = new InpsaApiClient(
      { INPSA_ENV: 'stage', INPSA_CLIENT_ID: 'c', INPSA_CLIENT_SECRET: 's' },
      vi.fn(),
    );
    await expect(client.fetchOrdersEvents()).rejects.toThrow(/INPSA_ORGANIZATION_ID/);
  });

  it('fetchOrder hits organization-scoped order path', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
      }
      if (url.endsWith('/inpsa/v1/organizations/org-merchant-1/orders/AB12345')) {
        return new Response(JSON.stringify({ id: 'AB12345', status: 'ACCEPTED' }), { status: 200 });
      }
      return new Response('nope', { status: 500 });
    }) as typeof fetch;

    const client = new InpsaApiClient(env, fetchFn);
    const result = await client.fetchOrder('AB12345');
    expect(result.status).toBe(200);
    expect(result.body?.id).toBe('AB12345');
  });

  it('retries 429 once after Retry-After', async () => {
    vi.useFakeTimers();
    let hits = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
      }
      hits += 1;
      if (hits === 1) {
        return new Response('slow', { status: 429, headers: { 'Retry-After': '1' } });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const client = new InpsaApiClient(env, fetchFn);
    const pending = client.fetchOrdersEvents({ limit: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    expect(result.status).toBe(200);
    expect(hits).toBe(2);
    vi.useRealTimers();
  });

  it('runStageSmoke reports token + orders poll status', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [{ id: '1' }, { id: '2' }] }), { status: 200 });
    }) as typeof fetch;

    const client = new InpsaApiClient(env, fetchFn);
    const smoke = await client.runStageSmoke({ limit: 1 });

    expect(smoke.deployment).toBe('stage');
    expect(smoke.ordersEvents.httpStatus).toBe(200);
    expect(smoke.ordersEvents.eventCount).toBe(2);
  });
});

describe('countOrderEvents', () => {
  it('counts events, items, or data arrays', () => {
    expect(countOrderEvents({ events: [{}, {}] })).toBe(2);
    expect(countOrderEvents({ items: [{}] })).toBe(1);
    expect(countOrderEvents({ data: [] })).toBe(0);
  });
});
