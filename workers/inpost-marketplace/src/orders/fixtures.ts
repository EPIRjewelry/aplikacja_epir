import type { InpsaOrder, InpsaOrderEvent } from '../inpsa-types';

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

/** OpenAPI order detail sample + quantity (fail-closed requires it). */
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
      price: { amount: 0, currency: 'PLN' },
    },
    orderLines: [
      {
        quantity: 1,
        offer: {
          offerId: 'd8ec11ce-12ba-4fb7-be9a-249e679f4e67',
          product: {
            productId: 'prod-1',
            name: 'Pierścionek test',
            sku: 'EPIR-RING-001',
            ean: '5904959447006',
          },
          finalPrice: { amount: 890, currency: 'PLN' },
          price: { amount: 890, currency: 'PLN' },
        },
      },
    ],
    finalPrice: { amount: 890, currency: 'PLN' },
    ...overrides,
  };
}
