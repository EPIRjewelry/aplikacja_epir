import { describe, expect, it } from 'vitest';
import { isDirectLikeSource, parseAttribution, toResolvedAttribution } from './attribution.js';

describe('@epir/ham-core attribution', () => {
  it('parses UTM from page URL', () => {
    const a = parseAttribution(
      {},
      'https://shop.example/products/x?utm_source=google&utm_medium=cpc&utm_campaign=spring',
      null,
    );
    expect(a.source).toBe('google');
    expect(a.medium).toBe('cpc');
    expect(a.campaign).toBe('spring');
  });

  it('resolved maps gclid to google/cpc', () => {
    const r = toResolvedAttribution({ traffic_source: null, traffic_medium: null, click_id_type: 'gclid' });
    expect(r.resolved_source).toBe('google');
    expect(r.resolved_medium).toBe('cpc');
  });

  it('detects direct-like sources', () => {
    expect(isDirectLikeSource('direct')).toBe(true);
    expect(isDirectLikeSource('google')).toBe(false);
  });
});
