import { describe, expect, it } from 'vitest';
import { mapOrderAttributionToPipelineRecord } from './order-pipeline-record';
import { mapPixelRowToPipelineRecord } from './pixel-pipeline-record';
import { q1SessionsWithChatAndPurchase } from './q1-session-join';

const SESSION = 'e2e-session-fixture-42';

describe('data flow fixture (pixel + chat + order)', () => {
  it('builds stream records and Q1 join on one session_id', () => {
    const pixelPurchase = mapPixelRowToPipelineRecord(
      {
        id: '1001',
        session_id: SESSION,
        event_type: 'purchase_completed',
        created_at: 1_700_000_100_000,
        page_url: 'https://epirbizuteria.pl/products/ring',
        customer_id: 'gid://shopify/Customer/7',
      },
      true,
    );
    const orderRow = mapOrderAttributionToPipelineRecord({
      shopify_order_gid: 'gid://shopify/Order/555',
      epir_session_id: SESSION,
      received_at: 1_700_000_200_000,
    });
    expect(orderRow).not.toBeNull();

    const streamRows = [
      {
        session_id: pixelPurchase.session_id,
        event_type: pixelPurchase.event_type,
      },
      {
        session_id: orderRow!.session_id,
        event_type: orderRow!.event_type,
      },
    ];
    const chatRows = [{ session_id: SESSION, role: 'user' }];

    expect(q1SessionsWithChatAndPurchase(streamRows, chatRows)).toEqual([SESSION]);
  });
});
