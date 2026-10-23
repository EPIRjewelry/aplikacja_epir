import { describe, expect, it, vi } from 'vitest';
import { countOrderEvents, InpsaApiClient } from './inpsa-api';
import type { Env } from './env';

const env: Env = {
  INPSA_ENV: 'stage',
  INPSA_CLIENT_ID: 'cid',
  INPSA_CLIENT_SECRET: 'csec',
};

describe('InpsaApiClient', () => {
  it('fetchOrdersEvents attaches bearer token and query params', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'access-1', expires_in: 300 }), { status: 200 });
      }
      if (url.includes('/inpsa/orders/events')) {
        expect(url).toContain('limit=5');
        return new Response(JSON.stringify({ events: [{ orderId: 'VH-1' }] }), { status: 200 });
      }
      return new Response('nope', { status: 500 });
    }) as typeof fetch;

    const client = new InpsaApiClient(env, fetchFn);
    const result = await client.fetchOrdersEvents({ limit: 5 });

    expect(result.status).toBe(200);
    expect(result.body?.events).toHaveLength(1);
    const ordersCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('orders/events'),
    );
    expect(ordersCall).toBeTruthy();
    const headers = ordersCall![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-1');
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
