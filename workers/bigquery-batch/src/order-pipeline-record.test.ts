import { describe, expect, it } from 'vitest';
import { mapOrderAttributionToPipelineRecord, orderPipelineStreamId } from './order-pipeline-record';

describe('order-pipeline-record', () => {
  it('prefixes stream id with order:', () => {
    expect(orderPipelineStreamId('gid://shopify/Order/99')).toBe('order:gid://shopify/Order/99');
  });

  it('maps attribution row with session and timestamp', () => {
    const rec = mapOrderAttributionToPipelineRecord({
      shopify_order_gid: 'gid://shopify/Order/99',
      epir_session_id: 'sess-abc',
      received_at: 1_700_000_000_123,
    });
    expect(rec).toMatchObject({
      session_id: 'sess-abc',
      event_type: 'order_attributed',
      timestamp: 1_700_000_000_123,
      id: 'order:gid://shopify/Order/99',
      order_id: 'gid://shopify/Order/99',
    });
  });

  it('returns null without epir_session_id', () => {
    expect(
      mapOrderAttributionToPipelineRecord({
        shopify_order_gid: 'gid://shopify/Order/1',
        epir_session_id: '',
        received_at: 1,
      }),
    ).toBeNull();
  });
});
