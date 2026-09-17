import {describe, expect, it} from 'vitest';
import {
  EPIR_GOLD_COLLECTION_URL,
  KAZKA_CATEGORY_NAV,
  KAZKA_HEADER_BRAND,
  KAZKA_HEADER_DESCRIPTOR,
  KAZKA_HEADER_TRUST,
} from './kazka-header';

describe('kazka-header', () => {
  it('exposes EPIR seller lockup and Kazka descriptor', () => {
    expect(KAZKA_HEADER_BRAND).toContain('EPIR Art Jewellery');
    expect(KAZKA_HEADER_DESCRIPTOR).toBe('Kazka Jewelry');
  });

  it('routes gold CTA to zlota-bizuteria with kazka attribution', () => {
    expect(EPIR_GOLD_COLLECTION_URL).toContain(
      '/collections/zlota-bizuteria',
    );
    expect(EPIR_GOLD_COLLECTION_URL).toContain('utm_source=kazka');
  });

  it('includes a compact trust line for header', () => {
    expect(KAZKA_HEADER_TRUST).toMatch(/EPIR/);
    expect(KAZKA_HEADER_TRUST).toMatch(/585/);
  });

  it('maps category nav to dedicated Shopify collections', () => {
    expect(KAZKA_CATEGORY_NAV.map((cat) => cat.handle)).toEqual([
      'kazka-pierscionki',
      'kazka-naszyjniki',
      'kazka-kolczyki',
      'kazka-bransoletki',
    ]);
    expect(KAZKA_CATEGORY_NAV.every((cat) => cat.path.startsWith('/collections/'))).toBe(
      true,
    );
  });
});
