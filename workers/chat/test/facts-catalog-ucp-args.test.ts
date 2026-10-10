import { describe, expect, it } from 'vitest';

import { buildUcpSearchCatalogArgs, CATALOG_SEARCH_SERVER_LIMIT } from '../src/facts/catalog-ucp-args';

describe('buildUcpSearchCatalogArgs', () => {
  it('defaults pagination limit 10 and context PLN without model overrides', () => {
    const args = buildUcpSearchCatalogArgs({ text: 'kolczyki' });
    const catalog = args.catalog as {
      context?: { currency?: string; address_country?: string };
      pagination?: { limit?: number };
    };
    expect(catalog.pagination?.limit).toBe(10);
    expect(catalog.context?.currency).toBe('PLN');
    expect(catalog.context?.address_country).toBe('PL');
  });

  it('price_max_pln 5000 → filters.price.max 500000 and context.currency PLN', () => {
    const args = buildUcpSearchCatalogArgs(
      { text: 'pierścionek', priceMax: 500_000 },
      CATALOG_SEARCH_SERVER_LIMIT,
    );
    const catalog = args.catalog as {
      filters?: { price?: { max?: number } };
      context?: { currency?: string };
      pagination?: { limit?: number };
    };
    expect(catalog.filters?.price?.max).toBe(500_000);
    expect(catalog.context?.currency).toBe('PLN');
    expect(catalog.pagination?.limit).toBe(10);
  });
});
