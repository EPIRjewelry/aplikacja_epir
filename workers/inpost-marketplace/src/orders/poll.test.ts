import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import { pollOrdersEventsPipeline } from './poll';
import { createMemoryInpsaOrdersDb } from './memory-d1';
import { fixtureAcceptedEvent, fixtureOrderDetail } from './fixtures';
import { getLastSuccessEventId, getProcessedByIdempotencyKey } from './store';

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    INPSA_ENV: 'stage',
    INPSA_CLIENT_ID: 'cid',
    INPSA_CLIENT_SECRET: 'csec',
    INPSA_ORGANIZATION_ID: 'org-1',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    SHOPIFY_ADMIN_TOKEN: 'shpat-test',
    ...overrides,
  };
}

describe('pollOrdersEventsPipeline', () => {
  it('dryRun: maps ACCEPTED order, zero Shopify Admin calls, D1 unchanged', async () => {
    const db = createMemoryInpsaOrdersDb();
    const shopifyCalls: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
      }
      if (url.includes('/orders/events')) {
        expect(url).not.toContain('cursor=');
        return new Response(
          JSON.stringify({ data: [fixtureAcceptedEvent()] }),
          { status: 200 },
        );
      }
      if (url.includes('/orders/AB12345')) {
        return new Response(JSON.stringify(fixtureOrderDetail()), { status: 200 });
      }
      if (url.includes('/admin/api/')) {
        shopifyCalls.push(url);
        return new Response('{}', { status: 500 });
      }
      return new Response('nope', { status: 500 });
    }) as typeof fetch;

    const result = await pollOrdersEventsPipeline(baseEnv({ INPSA_ORDERS_DB: db }), {
      dryRun: true,
      fetchFn,
      limit: 10,
    });

    expect(result.dryRun).toBe(true);
    expect(result.shopifyPlans[0]?.status).toBe('created');
    expect(result.shopifyPlans[0]?.orderCreateInput?.lineItems[0]?.sku).toBe('EPIR-RING-001');
    expect(shopifyCalls).toHaveLength(0);
    expect(await getLastSuccessEventId(db)).toBeNull();
    expect(await getProcessedByIdempotencyKey(db, 'inpsa-order:AB12345')).toBeNull();
  });

  it('live: unmatched SKU stops without cursor advance', async () => {
    const db = createMemoryInpsaOrdersDb();
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
      }
      if (url.includes('/orders/events')) {
        return new Response(JSON.stringify({ data: [fixtureAcceptedEvent()] }), { status: 200 });
      }
      if (url.includes('/orders/AB12345') && !url.includes('admin')) {
        return new Response(JSON.stringify(fixtureOrderDetail()), { status: 200 });
      }
      if (url.includes('/admin/api/') && init?.body) {
        const body = JSON.parse(String(init.body)) as { query?: string };
        if (body.query?.includes('VariantBySku')) {
          return new Response(
            JSON.stringify({ data: { productVariants: { nodes: [] } } }),
            { status: 200 },
          );
        }
      }
      return new Response('nope', { status: 500 });
    }) as typeof fetch;

    const result = await pollOrdersEventsPipeline(baseEnv({ INPSA_ORDERS_DB: db }), {
      dryRun: false,
      fetchFn,
    });

    expect(result.shopifyPlans[0]?.status).toBe('unmatched_sku');
    expect(result.stoppedEarly).toBe(true);
    expect(await getLastSuccessEventId(db)).toBeNull();
  });

  it('live: orderCreate once; second poll → duplicate; cursor advances', async () => {
    const db = createMemoryInpsaOrdersDb();
    let createCalls = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
      }
      if (url.includes('/orders/events')) {
        return new Response(JSON.stringify({ data: [fixtureAcceptedEvent()] }), { status: 200 });
      }
      if (url.includes('/inpsa/') && url.includes('/orders/AB12345')) {
        return new Response(JSON.stringify(fixtureOrderDetail()), { status: 200 });
      }
      if (url.includes('/admin/api/') && init?.body) {
        const body = JSON.parse(String(init.body)) as { query?: string };
        if (body.query?.includes('VariantBySku')) {
          return new Response(
            JSON.stringify({
              data: {
                productVariants: {
                  nodes: [{ id: 'gid://shopify/ProductVariant/1', sku: 'EPIR-RING-001' }],
                },
              },
            }),
            { status: 200 },
          );
        }
        if (body.query?.includes('OrderCreate')) {
          createCalls += 1;
          return new Response(
            JSON.stringify({
              data: {
                orderCreate: {
                  order: { id: 'gid://shopify/Order/99' },
                  userErrors: [],
                },
              },
            }),
            { status: 200 },
          );
        }
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    }) as typeof fetch;

    const env = baseEnv({ INPSA_ORDERS_DB: db });
    const first = await pollOrdersEventsPipeline(env, { dryRun: false, fetchFn });
    expect(first.shopifyPlans[0]?.status).toBe('created');
    expect(first.shopifyPlans[0]?.shopifyOrderGid).toBe('gid://shopify/Order/99');
    expect(createCalls).toBe(1);
    expect(await getLastSuccessEventId(db)).toBe('evt-accepted-1');

    const second = await pollOrdersEventsPipeline(env, { dryRun: false, fetchFn });
    expect(second.shopifyPlans[0]?.status).toBe('duplicate');
    expect(createCalls).toBe(1);
  });

  it('fetchOrdersEvents uses untilId query param when provided', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
      }
      if (url.includes('/orders/events')) {
        expect(url).toContain('untilId=evt-old');
        expect(url).not.toContain('cursor=');
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response('nope', { status: 500 });
    }) as typeof fetch;

    await pollOrdersEventsPipeline(baseEnv(), {
      dryRun: true,
      untilId: 'evt-old',
      fetchFn,
    });
  });
});
