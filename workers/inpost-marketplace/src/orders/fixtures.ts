import type { InpsaOrder, InpsaOrderEvent, InpsaOrderLine } from '../inpsa-types';

/** OpenAPI-shaped event (`data[]` sample). */
export function fixtureAcceptedEvent(
  overrides: Partial<InpsaOrderEvent> = {},
): InpsaOrderEvent {
  return {
    id: 'evt-accepted-1',
    order: { id: 'AB12345' },
    orderEventType: 'ACCEPTED',
    occurredAt: '2025-02-15T13:45:30Z',
    ...overrides,
  };
}

export function fixturePaidEvent(overrides: Partial<InpsaOrderEvent> = {}): InpsaOrderEvent {
  return fixtureAcceptedEvent({
    id: 'evt-paid-1',
    orderEventType: 'PAID',
    occurredAt: '2025-02-15T13:46:30Z',
    ...overrides,
  });
}

/** One OpenAPI order line: offer only, no quantity. */
export function fixtureOrderLine(sku = 'EPIR-RING-001', offerId = 'd8ec11ce-12ba-4fb7-be9a-249e679f4e67'): InpsaOrderLine {
  return {
    offer: {
      offerId,
      product: {
        productId: 'prod-1',
        name: 'Pierścionek test',
        sku,
        ean: '5904959447006',
      },
      price: { amount: 890, currency: 'PLN' },
      finalPrice: { amount: 890, currency: 'PLN' },
    },
  };
}

/** OpenAPI order detail sample — line has offer only (no quantity, no lineItemId). */
export function fixtureOrderDetail(overrides: Partial<InpsaOrder> = {}): InpsaOrder {
  return {
    id: 'AB12345',
    organizationId: 'd8ec11ce-12ba-4fb7-be9a-249e679f4e67',
    createdAt: '2025-02-15T13:45:30Z',
    updatedAt: '2025-02-15T13:45:30Z',
    status: 'ACCEPTED',
    customer: {
      email: 'buyer@example.com',
      firstName: 'Anna',
      lastName: 'Kowalska',
      phoneNumber: '+48345678901',
      address: {
        street: 'Kwiatowa',
        city: 'Wrocław',
        postCode: '50-001',
        countryCode: 'PL',
        building: '1',
      },
    },
    delivery: {
      deliveryType: 'APM',
      name: 'Anna Kowalska',
      email: 'buyer@example.com',
      phoneNumber: '+48345678901',
      address: {
        street: 'Kwiatowa',
        city: 'Wrocław',
        postCode: '50-001',
        countryCode: 'PL',
        building: '1',
      },
      price: { amount: 12, currency: 'PLN' },
    },
    orderLines: [fixtureOrderLine()],
    finalPrice: { amount: 902, currency: 'PLN' },
    paymentDetails: {
      selectedPaymentType: 'CARD',
      payments: [{ paymentId: 'pay-1', paymentType: 'CARD', paymentDate: '2025-02-15T13:46:30Z' }],
    },
    ...overrides,
  };
}
