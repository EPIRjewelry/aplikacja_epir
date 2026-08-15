import {describe, expect, it} from 'vitest';
import {storefrontProductSearchQuery} from './storefront-product-search-query';

describe('storefrontProductSearchQuery', () => {
  it('scopes EPIR handle/SKU so 104-10004-5-1 does not match 104-10004-5-7', () => {
    expect(storefrontProductSearchQuery('104-10004-5-1')).toBe(
      'handle:104-10004-5-1 OR sku:104-10004-5-1',
    );
  });

  it('leaves natural-language phrases unchanged', () => {
    expect(storefrontProductSearchQuery('Naszyjnik Soliter')).toBe(
      'Naszyjnik Soliter',
    );
  });
});
