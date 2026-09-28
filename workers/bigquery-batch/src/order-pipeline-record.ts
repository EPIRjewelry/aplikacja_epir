import type { PixelPipelineStreamRecord } from './pixel-pipeline-record';

const ORDER_ID_PREFIX = 'order:';

export function orderPipelineStreamId(shopifyOrderGid: string): string {
  const gid = shopifyOrderGid.trim();
  if (!gid) return `${ORDER_ID_PREFIX}unknown`;
  return gid.startsWith(ORDER_ID_PREFIX) ? gid : `${ORDER_ID_PREFIX}${gid}`;
}

/** Rekord zamówienia na tym samym streamie co pixel (`event_type = order_attributed`). */
export function mapOrderAttributionToPipelineRecord(row: Record<string, unknown>): PixelPipelineStreamRecord | null {
  const sessionId = typeof row.epir_session_id === 'string' ? row.epir_session_id.trim() : '';
  if (!sessionId) return null;

  const gid = String(row.shopify_order_gid ?? '').trim();
  if (!gid) return null;

  const receivedAt =
    typeof row.received_at === 'number' && Number.isFinite(row.received_at)
      ? Math.floor(row.received_at)
      : Date.now();

  return {
    session_id: sessionId,
    event_type: 'order_attributed',
    timestamp: receivedAt,
    page_url: 'https://epir.local/order',
    id: orderPipelineStreamId(gid),
    order_id: gid,
    customer_id: null,
  };
}
