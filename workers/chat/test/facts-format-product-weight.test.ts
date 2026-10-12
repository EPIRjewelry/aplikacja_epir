import {describe, expect, it} from 'vitest';
import {formatProductsBlock, PAGE_PRODUCT_HEADER} from '../src/facts/format-product-block';
import type {ProductFacts, VariantFacts} from '../src/facts/types';

function minimalProduct(overrides: Partial<ProductFacts>): ProductFacts {
  return {
    channel: 'epir-online-store',
    productId: 'gid://shopify/Product/1',
    handle: 'test',
    title: 'Test',
    vendor: '',
    productType: null,
    url: 'https://epirbizuteria.pl/products/test',
    image: null,
    collections: [],
    descriptionText: '<p>Waga: 6,4 g. Srebro.</p>',
    options: [],
    variants: [],
    priceRange: {
      min: {minor: 0, currency: 'PLN', display_pl: '100 zł'},
      max: {minor: 0, currency: 'PLN', display_pl: '100 zł'},
      isFlat: true,
    },
    stones: [],
    metals: [],
    sizes: [],
    metafields: {},
    productOriginRaw: null,
    dataIssues: [],
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('formatSingleProductDescriptive weight and opis', () => {
  it('omits waga when variant weight is 0', () => {
    const variants: VariantFacts[] = [
      {
        variantId: 'gid://shopify/ProductVariant/1',
        title: 'default',
        image: null,
        sku: null,
        weight: 0,
        weightUnit: 'GRAMS',
        price: {minor: 10000, currency: 'PLN', display_pl: '100 zł'},
        compareAtPrice: null,
        available: true,
        selectedOptions: [],
        metal: null,
        size: null,
        stoneOrigin: 'unknown',
        originEvidence: [],
      },
    ];
    const {descriptive} = formatProductsBlock(
      PAGE_PRODUCT_HEADER,
      [{product: minimalProduct({variants}), variants}],
      1,
    );
    expect(descriptive).not.toMatch(/waga:\s*0/);
    expect(descriptive).toContain('opis:');
    expect(descriptive).toContain('Waga: 6,4 g');
  });
});
