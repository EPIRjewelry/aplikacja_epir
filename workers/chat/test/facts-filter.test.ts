import {describe, expect, it} from 'vitest';
import {filterProducts} from '../src/facts/filter';
import type {ProductFacts} from '../src/facts/types';

const sample: ProductFacts = {
  product_id: 'gid://shopify/Product/99',
  handle: 'multi-origin',
  title: 'Test ring',
  collections: [],
  variants: [
    {
      variant_id: 'gid://shopify/ProductVariant/n1',
      available: true,
      origin: 'natural',
      price: {amount_minor: 372962, display_pl: '3729,62 zł'},
      metal: 'srebro',
    },
    {
      variant_id: 'gid://shopify/ProductVariant/l1',
      available: true,
      origin: 'lab_grown',
      price: {amount_minor: 400114, display_pl: '4001,14 zł'},
      metal: 'srebro',
    },
  ],
  issues: [],
};

describe('facts filter (variant-level)', () => {
  it('origin natural returns only natural variants and price range', () => {
    const matches = filterProducts([sample], {origin: ['natural']});
    expect(matches).toHaveLength(1);
    expect(matches[0].matchingVariants).toHaveLength(1);
    expect(matches[0].matchingVariants[0].variant_id).toContain('n1');
    expect(matches[0].matchingPriceRange?.min.amount_minor).toBe(372962);
    expect(matches[0].matchingPriceRange?.max.amount_minor).toBe(372962);
    expect(matches[0].isFlat).toBe(true);
  });

  it('priceMax 300 PLN includes product when a variant qualifies', () => {
    const cheap: ProductFacts = {
      ...sample,
      product_id: 'gid://shopify/Product/100',
      variants: [
        {
          variant_id: 'gid://shopify/ProductVariant/c1',
          available: true,
          origin: 'natural',
          price: {amount_minor: 25000, display_pl: '250,00 zł'},
        },
      ],
    };
    const matches = filterProducts([sample, cheap], {priceMax: 30000});
    expect(matches.map((m) => m.product.product_id)).toContain(cheap.product_id);
  });
});
