import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import type { InpsaOrderEvent } from '../inpsa-types';
import { pollOrdersEventsPipeline, reconcilePaidOrders } from './poll';
import { createMemoryInpsaOrdersDb } from './memory-d1';
import { fixtureAcceptedEvent, fixtureOrderDetail, fixturePaidEvent } from './fixtures';
import { getLastSuccessEventId, getProcessedByIdempotencyKey, setLastSuccessEventId } from './store';

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

function tokenOr(url: string, next: () => Response): Response {
  if (url.includes('/oauth2/token')) {
    return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
  }
  return next();
}

describe('pollOrdersEventsPipeline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dryRun: maps PAID order, zero Shopify Admin calls, D1 unchanged', async () => {
    const db = createMemoryInpsaOrdersDb();
    const shopifyCalls: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return tokenOr(url, () => {
        if (url.includes('/orders/events')) {
          expect(url).not.toContain('untilId=');
          return new Response(JSON.stringify({ data: [fixturePaidEvent()] }), { status: 200 });
        }
        if (url.includes('/orders/AB12345')) {
          return new Response(JSON.stringify(fixtureOrderDetail()), { status: 200 });
        }
        if (url.includes('/admin/api/')) {
          shopifyCalls.push(url);
          return new Response('{}', { status: 500 });
        }
        return new Response('nope', { status: 500 });
      });
    }) as typeof fetch;

    const result = await pollOrdersEventsPipeline(baseEnv({ INPSA_ORDERS_DB: db }), {
      dryRun: true,
      fetchFn,
      limit: 10,
    });

    expect(result.dryRun).toBe(true);
    expect(result.shopifyPlans[0]?.status).toBe('created');
    expect(result.shopifyPlans[0]?.orderCreateInput?.lineItems[0]?.quantity).toBe(1);
    expect(shopifyCalls).toHaveLength(0);
    expect(await getLastSuccessEventId(db)).toBeNull();
    expect(await getProcessedByIdempotencyKey(db, 'inpsa-order:AB12345')).toBeNull();
  });

  it('live: unmatched SKU is stored and does not block a newer order', async () => {
    const db = createMemoryInpsaOrdersDb();
    let createCalls = 0;
    const bad = fixturePaidEvent({
      id: 'evt-bad',
      occurredAt: '2025-02-15T13:40:00Z',
      order: { id: 'BAD-1' },
    });
    const good = fixturePaidEvent({
      id: 'evt-good',
      occurredAt: '2025-02-15T13:50:00Z',
      order: { id: 'GOOD-1' },
    });
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      return tokenOr(url, () => {
        if (url.includes('/orders/events')) {
          return new Response(JSON.stringify({ data: [good, bad] }), { status: 200 });
        }
        if (url.includes('/orders/BAD-1')) {
          return new Response(JSON.stringify(fixtureOrderDetail({ id: 'BAD-1' })), { status: 200 });
        }
        if (url.includes('/orders/GOOD-1')) {
          return new Response(
            JSON.stringify(fixtureOrderDetail({ id: 'GOOD-1', orderLines: [{
              offer: {
                offerId: 'offer-good',
                product: { sku: 'EPIR-GOOD', name: 'Good' },
                price: { amount: 100, currency: 'PLN' },
              },
            }] })),
            { status: 200 },
          );
        }
        if (url.includes('/admin/api/') && init?.body) {
          const body = JSON.parse(String(init.body)) as { query?: string; variables?: { order?: { transactions?: unknown } } };
          if (body.query?.includes('VariantBySku')) {
            const skuQuery = JSON.parse(String(init.body)).variables.q as string;
            if (skuQuery.includes('EPIR-GOOD')) {
              return new Response(JSON.stringify({
                data: { productVariants: { nodes: [{ id: 'gid://shopify/ProductVariant/2', sku: 'EPIR-GOOD' }] } },
              }), { status: 200 });
            }
            return new Response(JSON.stringify({ data: { productVariants: { nodes: [] } } }), { status: 200 });
          }
          if (body.query?.includes('OrderCreate')) {
            createCalls += 1;
            return new Response(JSON.stringify({
              data: { orderCreate: { order: { id: 'gid://shopify/Order/2' }, userErrors: [] } },
            }), { status: 200 });
          }
        }
        return new Response('nope', { status: 500 });
      });
    }) as typeof fetch;

    const result = await pollOrdersEventsPipeline(baseEnv({ INPSA_ORDERS_DB: db }), { dryRun: false, fetchFn });

    expect(result.shopifyPlans.map((plan) => plan.status)).toEqual(['unmatched_sku', 'created']);
    expect(result.failedEventIds).toEqual(['evt-bad']);
    expect(createCalls).toBe(1);
    expect(await getLastSuccessEventId(db)).toBe('evt-good');
    expect((await getProcessedByIdempotencyKey(db, 'inpsa-order:BAD-1'))?.status).toBe('unmatched_sku');
  });

  it('ACCEPTED then PAID creates exactly one Shopify order', async () => {
    const db = createMemoryInpsaOrdersDb();
    let createCalls = 0;
    const accepted = fixtureAcceptedEvent({ id: 'evt-acc', occurredAt: '2025-02-15T13:40:00Z' });
    const paid = fixturePaidEvent({ id: 'evt-paid', occurredAt: '2025-02-15T13:50:00Z' });
    const fetchFn = adminFetch({
      events: [paid, accepted],
      onCreate: () => {
        createCalls += 1;
      },
    });

    const result = await pollOrdersEventsPipeline(baseEnv({ INPSA_ORDERS_DB: db }), { dryRun: false, fetchFn });
    expect(result.shopifyPlans.map((plan) => plan.status)).toEqual(['skipped_event_type', 'created']);
    expect(createCalls).toBe(1);
    expect(await getProcessedByIdempotencyKey(db, 'inpsa-order:AB12345')).toMatchObject({
      status: 'created',
      shopify_order_gid: 'gid://shopify/Order/99',
    });
  });

  it('sends priceSet, shipping, PLN transaction and inventoryBehaviour', async () => {
    const db = createMemoryInpsaOrdersDb();
    let orderBody: { order?: Record<string, unknown>; options?: Record<string, unknown> } | undefined;
    const fetchFn = adminFetch({
      events: [fixturePaidEvent()],
      onCreate: (variables) => {
        orderBody = variables;
      },
    });
    await pollOrdersEventsPipeline(baseEnv({ INPSA_ORDERS_DB: db }), { dryRun: false, fetchFn });
    expect(orderBody?.order?.currency).toBe('PLN');
    const line = (orderBody?.order?.lineItems as Array<Record<string, unknown>>)[0];
    expect(line.priceSet).toEqual({ shopMoney: { amount: 890, currencyCode: 'PLN' } });
    expect(orderBody?.order?.shippingLines).toEqual([
      { title: 'INPSA', priceSet: { shopMoney: { amount: 12, currencyCode: 'PLN' } } },
    ]);
    const tx = (orderBody?.order?.transactions as Array<Record<string, unknown>>)[0];
    expect(tx.kind).toBe('SALE');
    expect(tx).not.toHaveProperty('gateway');
    expect(tx.amountSet).toEqual({ shopMoney: { amount: 902, currencyCode: 'PLN' } });
    expect(orderBody?.options).toEqual({
      inventoryBehaviour: 'DECREMENT_OBEYING_POLICY',
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    });
  });

  it('pages backward with untilId until the saved event and processes the whole backlog', async () => {
    const db = createMemoryInpsaOrdersDb();
    await setLastSuccessEventId(db, 'wm', '2025-01-01T00:00:00Z');
    const ids = ['e1', 'e2', 'e3'];
    const events: Record<string, InpsaOrderEvent> = {
      e3: fixturePaidEvent({ id: 'e3', occurredAt: '2025-03-03T00:00:00Z', order: { id: 'O3' } }),
      e2: fixturePaidEvent({ id: 'e2', occurredAt: '2025-03-02T00:00:00Z', order: { id: 'O2' } }),
      e1: fixturePaidEvent({ id: 'e1', occurredAt: '2025-03-01T00:00:00Z', order: { id: 'O1' } }),
      wm: fixturePaidEvent({ id: 'wm', occurredAt: '2025-01-01T00:00:00Z', order: { id: 'OW' } }),
    };
    let createCalls = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      return tokenOr(url, () => {
        if (url.includes('/orders/events')) {
          if (!url.includes('untilId=')) {
            return new Response(JSON.stringify({ data: [events.e3, events.e2] }), { status: 200 });
          }
          expect(url).toContain('untilId=e2');
          return new Response(JSON.stringify({ data: [events.e1, events.wm] }), { status: 200 });
        }
        const orderId = url.match(/\/orders\/(O\d)/)?.[1];
        if (orderId) {
          return new Response(JSON.stringify(fixtureOrderDetail({ id: orderId })), { status: 200 });
        }
        if (url.includes('/admin/api/') && init?.body) {
          const body = JSON.parse(String(init.body)) as { query?: string };
          if (body.query?.includes('VariantBySku')) {
            return new Response(JSON.stringify({
              data: { productVariants: { nodes: [{ id: 'gid://shopify/ProductVariant/1', sku: 'EPIR-RING-001' }] } },
            }), { status: 200 });
          }
          if (body.query?.includes('OrderCreate')) {
            createCalls += 1;
            return new Response(JSON.stringify({
              data: { orderCreate: { order: { id: `gid://shopify/Order/${createCalls}` }, userErrors: [] } },
            }), { status: 200 });
          }
        }
        return new Response('nope', { status: 500 });
      });
    }) as typeof fetch;

    const result = await pollOrdersEventsPipeline(baseEnv({ INPSA_ORDERS_DB: db }), {
      dryRun: false,
      fetchFn,
      limit: 2,
    });
    expect(result.events.map((event) => event.id)).toEqual(ids);
    expect(createCalls).toBe(3);
    expect(await getLastSuccessEventId(db)).toBe('e3');
  });

  it('D1 failure after orderCreate does not create a second Shopify order', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const inner = createMemoryInpsaOrdersDb();
    let thrown = false;
    const db = {
      prepare(sql: string) {
        const stmt = inner.prepare(sql);
        return {
          bind(...args: unknown[]) {
            const bound = stmt.bind(...(args as []));
            return {
              first: () => bound.first(),
              all: () => bound.all(),
              run: async () => {
                if (sql.includes('UPDATE inpsa_processed_orders') && args[1] === 'created' && !thrown) {
                  thrown = true;
                  throw new Error('d1 down');
                }
                return bound.run();
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    let createCalls = 0;
    const fetchFn = adminFetch({
      events: [fixturePaidEvent({ id: 'evt-1', occurredAt: '2025-02-15T13:46:30Z' })],
      onCreate: () => {
        createCalls += 1;
      },
      findGid: 'gid://shopify/Order/99',
    });

    const env = baseEnv({ INPSA_ORDERS_DB: db });
    const first = await pollOrdersEventsPipeline(env, { dryRun: false, fetchFn });
    expect(first.shopifyPlans[0]?.status).toBe('error');
    expect(first.shopifyPlans[0]?.note).toMatch(/D1 update failed/);
    expect(createCalls).toBe(1);
    expect((await getProcessedByIdempotencyKey(db, 'inpsa-order:AB12345'))?.status).toBe('pending');

    vi.setSystemTime(new Date('2026-01-01T00:20:00Z'));
    const later = adminFetch({
      events: [fixturePaidEvent({ id: 'evt-2', occurredAt: '2025-02-15T14:00:00Z' })],
      onCreate: () => {
        createCalls += 1;
      },
      findGid: 'gid://shopify/Order/99',
    });
    const second = await pollOrdersEventsPipeline(env, { dryRun: false, fetchFn: later });
    expect(second.shopifyPlans[0]?.status).toBe('duplicate');
    expect(second.shopifyPlans[0]?.shopifyOrderGid).toBe('gid://shopify/Order/99');
    expect(createCalls).toBe(1);
  });

  it('fetchOrdersEvents uses untilId query param when provided', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return tokenOr(url, () => {
        if (url.includes('/orders/events')) {
          expect(url).toContain('untilId=evt-old');
          expect(url).not.toContain('cursor=');
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response('nope', { status: 500 });
      });
    }) as typeof fetch;

    await pollOrdersEventsPipeline(baseEnv(), { dryRun: true, untilId: 'evt-old', fetchFn });
  });
});

describe('reconcilePaidOrders', () => {
  it('pages updatedAtGte and imports a paid order missing from D1', async () => {
    const db = createMemoryInpsaOrdersDb();
    let createCalls = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      return tokenOr(url, () => {
        if (url.includes('/orders?') || url.includes('/orders?updatedAtGte')) {
          expect(url).toContain('updatedAtGte=2025-02-01');
          expect(url).toContain('limit=30');
          const offset = Number(new URL(url).searchParams.get('offset'));
          if (offset === 0) {
            return new Response(JSON.stringify({
              page: { limit: 30, offset: 0, total: 1 },
              data: [fixtureOrderDetail()],
            }), { status: 200 });
          }
          return new Response(JSON.stringify({ page: { total: 1 }, data: [] }), { status: 200 });
        }
        if (url.includes('/admin/api/') && init?.body) {
          const body = JSON.parse(String(init.body)) as { query?: string };
          if (body.query?.includes('VariantBySku')) {
            return new Response(JSON.stringify({
              data: { productVariants: { nodes: [{ id: 'gid://shopify/ProductVariant/1', sku: 'EPIR-RING-001' }] } },
            }), { status: 200 });
          }
          if (body.query?.includes('OrderCreate')) {
            createCalls += 1;
            return new Response(JSON.stringify({
              data: { orderCreate: { order: { id: 'gid://shopify/Order/5' }, userErrors: [] } },
            }), { status: 200 });
          }
        }
        return new Response('nope', { status: 500 });
      });
    }) as typeof fetch;

    const result = await reconcilePaidOrders(baseEnv({ INPSA_ORDERS_DB: db }), {
      updatedAtGte: '2025-02-01T00:00:00Z',
      dryRun: false,
      fetchFn,
    });
    expect(createCalls).toBe(1);
    expect(result.importedOrderIds).toEqual(['AB12345']);
    expect(result.failedOrderIds).toEqual([]);
  });
});

function adminFetch(options: {
  events: InpsaOrderEvent[];
  onCreate: (variables: { order?: Record<string, unknown>; options?: Record<string, unknown> }) => void;
  findGid?: string;
}): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    return tokenOr(url, () => {
      if (url.includes('/orders/events')) {
        return new Response(JSON.stringify({ data: options.events }), { status: 200 });
      }
      if (url.includes('/inpsa/') && url.includes('/orders/AB12345')) {
        return new Response(JSON.stringify(fixtureOrderDetail()), { status: 200 });
      }
      if (url.includes('/admin/api/') && init?.body) {
        const body = JSON.parse(String(init.body)) as {
          query?: string;
          variables?: { order?: Record<string, unknown>; options?: Record<string, unknown> };
        };
        if (body.query?.includes('VariantBySku')) {
          return new Response(JSON.stringify({
            data: { productVariants: { nodes: [{ id: 'gid://shopify/ProductVariant/1', sku: 'EPIR-RING-001' }] } },
          }), { status: 200 });
        }
        if (body.query?.includes('OrdersByInpostTag')) {
          return new Response(JSON.stringify({
            data: {
              orders: {
                nodes: options.findGid
                  ? [{
                    id: options.findGid,
                    customAttributes: [{ key: 'inpsa_marketplace_order_id', value: 'AB12345' }],
                  }]
                  : [],
              },
            },
          }), { status: 200 });
        }
        if (body.query?.includes('OrderCreate')) {
          options.onCreate(body.variables ?? {});
          return new Response(JSON.stringify({
            data: { orderCreate: { order: { id: 'gid://shopify/Order/99' }, userErrors: [] } },
          }), { status: 200 });
        }
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });
  }) as typeof fetch;
}
