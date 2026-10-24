import { describe, expect, it } from 'vitest';
import { mapInpsaOrderToShopifyPlan } from './map-order';
import { fixtureAcceptedEvent, fixtureOrderDetail } from './fixtures';

describe('mapInpsaOrderToShopifyPlan', () => {
  it('maps OpenAPI-shaped ACCEPTED order to orderCreate plan (PLN, tag inpost-vh)', () => {
    const plan = mapInpsaOrderToShopifyPlan(fixtureAcceptedEvent(), fixtureOrderDetail());
    expect(plan.status).toBe('created');
    expect(plan.marketplaceOrderId).toBe('AB12345');
    expect(plan.idempotencyKey).toBe('inpsa-order:AB12345');
    expect(plan.orderCreateInput?.sourceName).toBe('inpost-vh');
    expect(plan.orderCreateInput?.tags).toEqual(['inpost-vh']);
    expect(plan.orderCreateInput?.lineItems).toEqual([
      expect.objectContaining({ sku: 'EPIR-RING-001', quantity: 1 }),
    ]);
    expect(plan.orderCreateInput?.total).toEqual({ amount: 890, currency: 'PLN' });
    expect(plan.orderCreateInput?.customAttributes).toContainEqual({
      key: 'inpsa_marketplace_order_id',
      value: 'AB12345',
    });
  });

  it('missing order.id → missing_marketplace_id', () => {
    const plan = mapInpsaOrderToShopifyPlan(
      fixtureAcceptedEvent({ order: undefined }),
      fixtureOrderDetail(),
    );
    expect(plan.status).toBe('missing_marketplace_id');
  });

  it('CREATED event → skipped_event_type', () => {
    const plan = mapInpsaOrderToShopifyPlan(
      fixtureAcceptedEvent({ orderEventType: 'CREATED' }),
      fixtureOrderDetail(),
    );
    expect(plan.status).toBe('skipped_event_type');
  });

  it('missing line quantity → error (fail closed)', () => {
    const order = fixtureOrderDetail({
      orderLines: [
        {
          offer: {
            product: { sku: 'EPIR-RING-001' },
            finalPrice: { amount: 10, currency: 'PLN' },
          },
        },
      ],
    });
    const plan = mapInpsaOrderToShopifyPlan(fixtureAcceptedEvent(), order);
    expect(plan.status).toBe('error');
    expect(plan.note).toMatch(/quantity/i);
  });

  it('missing sku → unmatched_sku', () => {
    const order = fixtureOrderDetail({
      orderLines: [
        {
          quantity: 1,
          offer: { product: { name: 'x' }, finalPrice: { amount: 10, currency: 'PLN' } },
        },
      ],
    });
    const plan = mapInpsaOrderToShopifyPlan(fixtureAcceptedEvent(), order);
    expect(plan.status).toBe('unmatched_sku');
  });
});
