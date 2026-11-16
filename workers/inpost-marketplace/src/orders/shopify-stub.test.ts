import { describe, expect, it } from 'vitest';
import { INPOST_VH_ORDER_SOURCE, INPOST_VH_ORDER_TAG } from './constants';
import { shopifyIdempotencyKeyForEvent } from './idempotency';
import { planShopifyOrderFromEvent } from './shopify-stub';

describe('shopify idempotency', () => {
  it('builds stable key from orderId', () => {
    expect(shopifyIdempotencyKeyForEvent({ orderId: 'MP-42' })).toBe('inpsa-order:MP-42');
  });
});

describe('planShopifyOrderFromEvent', () => {
  it('tags source inpost-vh', () => {
    const plan = planShopifyOrderFromEvent({ order_id: '99' });
    expect(plan.source).toBe(INPOST_VH_ORDER_SOURCE);
    expect(plan.tags).toContain(INPOST_VH_ORDER_TAG);
    expect(plan.idempotencyKey).toBe('inpsa-order:99');
    expect(plan.status).toBe('not_implemented');
  });

  it('flags missing marketplace id', () => {
    const plan = planShopifyOrderFromEvent({ foo: 'bar' });
    expect(plan.status).toBe('missing_marketplace_id');
  });
});
