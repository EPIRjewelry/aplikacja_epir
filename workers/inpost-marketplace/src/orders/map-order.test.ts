import { describe, expect, it } from 'vitest';
import { mapInpsaOrderToShopifyPlan } from './map-order';
import { fixtureAcceptedEvent, fixtureOrderDetail, fixtureOrderLine, fixturePaidEvent } from './fixtures';

describe('mapInpsaOrderToShopifyPlan', () => {
  it('maps OpenAPI-shaped PAID order (no quantity on the line)', () => {
    const plan = mapInpsaOrderToShopifyPlan(fixturePaidEvent(), fixtureOrderDetail());
    expect(plan.status).toBe('created');
    expect(plan.marketplaceOrderId).toBe('AB12345');
    expect(plan.idempotencyKey).toBe('inpsa-order:AB12345');
    expect(plan.orderCreateInput?.sourceName).toBe('inpost-vh');
    expect(plan.orderCreateInput?.tags).toEqual(['inpost-vh']);
    expect(plan.orderCreateInput?.lineItems).toEqual([
      expect.objectContaining({ sku: 'EPIR-RING-001', quantity: 1, unitAmount: 890, currency: 'PLN' }),
    ]);
    expect(plan.orderCreateInput?.shippingPrice).toEqual({ amount: 12, currency: 'PLN' });
    expect(plan.orderCreateInput?.transactionAmount).toBe(902);
    expect(plan.orderCreateInput?.customAttributes).toContainEqual({
      key: 'inpsa_marketplace_order_id',
      value: 'AB12345',
    });
  });

  it('groups one-unit OpenAPI lines of the same offer into quantity', () => {
    const order = fixtureOrderDetail({
      orderLines: [
        fixtureOrderLine('EPIR-RING-001', 'offer-1'),
        fixtureOrderLine('EPIR-RING-001', 'offer-1'),
      ],
    });
    const plan = mapInpsaOrderToShopifyPlan(fixturePaidEvent(), order);
    expect(plan.status).toBe('created');
    expect(plan.orderCreateInput?.lineItems).toEqual([
      expect.objectContaining({ sku: 'EPIR-RING-001', quantity: 2, unitAmount: 890 }),
    ]);
    expect(plan.orderCreateInput?.transactionAmount).toBe(890 * 2 + 12);
  });

  it('missing order.id → missing_marketplace_id', () => {
    const plan = mapInpsaOrderToShopifyPlan(
      fixturePaidEvent({ order: undefined }),
      fixtureOrderDetail(),
    );
    expect(plan.status).toBe('missing_marketplace_id');
  });

  it('ACCEPTED and CREATED do not map to a Shopify create', () => {
    expect(mapInpsaOrderToShopifyPlan(fixtureAcceptedEvent(), fixtureOrderDetail()).status).toBe(
      'skipped_event_type',
    );
    expect(
      mapInpsaOrderToShopifyPlan(fixtureAcceptedEvent({ orderEventType: 'CREATED' }), fixtureOrderDetail())
        .status,
    ).toBe('skipped_event_type');
  });

  it('PAID without payments → error', () => {
    const plan = mapInpsaOrderToShopifyPlan(
      fixturePaidEvent(),
      fixtureOrderDetail({ paymentDetails: { payments: [] } }),
    );
    expect(plan.status).toBe('error');
    expect(plan.note).toMatch(/payments/);
  });

  it('non-PLN unit price → error', () => {
    const line = fixtureOrderLine();
    line.offer!.price = { amount: 10, currency: 'EUR' };
    const plan = mapInpsaOrderToShopifyPlan(fixturePaidEvent(), fixtureOrderDetail({ orderLines: [line] }));
    expect(plan.status).toBe('error');
    expect(plan.note).toMatch(/PLN/);
  });

  it('missing sku → unmatched_sku', () => {
    const plan = mapInpsaOrderToShopifyPlan(
      fixturePaidEvent(),
      fixtureOrderDetail({
        orderLines: [{ offer: { product: { name: 'x' }, price: { amount: 10, currency: 'PLN' } } }],
      }),
    );
    expect(plan.status).toBe('unmatched_sku');
  });
});
