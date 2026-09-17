import { pixelCreatedAtMs } from './d1-timestamps';

/** Rekord zgodny ze schematem `epir_pixel_events_stream` w Cloudflare Pipelines (prod). */
export type PixelPipelineStreamRecord = {
  session_id: string;
  event_type: string;
  timestamp: number;
  page_url?: string;
  referrer?: string | null;
  user_agent?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  price?: number | null;
  currency?: string | null;
  shop_domain?: string | null;
};

const UNKNOWN_PAGE = 'https://epir.local/unknown';

export function mapPixelRowToPipelineRecord(row: Record<string, unknown>): PixelPipelineStreamRecord {
  const pageUrl = String(row.page_url ?? '').trim();
  const tsMs = pixelCreatedAtMs(row.created_at);
  const priceRaw = row.product_price;
  const price =
    typeof priceRaw === 'number' && Number.isFinite(priceRaw)
      ? priceRaw
      : priceRaw != null && String(priceRaw).trim() !== ''
        ? Number(priceRaw)
        : null;

  return {
    session_id: String(row.session_id ?? ''),
    event_type: String(row.event_type ?? ''),
    timestamp: tsMs > 0 ? tsMs : Date.now(),
    page_url: pageUrl || UNKNOWN_PAGE,
    referrer: row.referrer != null ? String(row.referrer) : null,
    user_agent: row.user_agent != null ? String(row.user_agent) : null,
    utm_source: row.traffic_source != null ? String(row.traffic_source) : null,
    utm_medium: row.traffic_medium != null ? String(row.traffic_medium) : null,
    utm_campaign: row.traffic_campaign != null ? String(row.traffic_campaign) : null,
    product_id: row.product_id != null ? String(row.product_id) : null,
    product_name: row.product_title != null ? String(row.product_title) : null,
    price: price != null && Number.isFinite(price) ? price : null,
    currency: null,
    shop_domain: null,
  };
}
