import { describe, expect, it } from 'vitest';
import { mapPixelRowToPipelineRecord } from './pixel-pipeline-record';

describe('mapPixelRowToPipelineRecord', () => {
  it('maps D1 row to Cloudflare stream schema (timestamp + page_url)', () => {
    const rec = mapPixelRowToPipelineRecord({
      session_id: 's1',
      event_type: 'page_viewed',
      created_at: 1_700_000_000_000,
      page_url: 'https://epirbizuteria.pl/products/x',
      referrer: 'https://google.com',
      traffic_source: 'google',
      traffic_medium: 'cpc',
      traffic_campaign: 'spring',
      user_agent: 'Mozilla/5.0',
      product_id: 'gid://shopify/Product/1',
      product_title: 'Ring',
      product_price: 1200,
    });
    expect(rec.session_id).toBe('s1');
    expect(rec.event_type).toBe('page_viewed');
    expect(rec.timestamp).toBe(1_700_000_000_000);
    expect(rec.page_url).toBe('https://epirbizuteria.pl/products/x');
    expect(rec.referrer).toBe('https://google.com');
    expect(rec.utm_source).toBe('google');
    expect(rec).not.toHaveProperty('url');
    expect(rec).not.toHaveProperty('payload');
  });
});
