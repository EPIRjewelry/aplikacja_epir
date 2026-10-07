import {describe, expect, it} from 'vitest';
import {computeFacetsFromMatches, filterProducts} from '../src/facts/filter';
import type {ProductFacts} from '../src/facts/types';
import {moneyFromMinor} from '../src/facts/types';

const sample: ProductFacts = {
  channel: 'epir-online-store',
  productId: 'gid://shopify/Product/99',
  handle: 'multi-origin',
  title: 'Test ring',
  vendor: 'EPIR',
  productType: 'Pierścionki',
  url: 'https://epirbizuteria.pl/products/multi-origin',
  image: null,
  collections: [],
  descriptionText: '',
  options: [],
  stones: [],
  metals: ['srebro'],
  sizes: [],
  metafields: {},
  productOriginRaw: null,
  dataIssues: [],
  fetchedAt: new Date().toISOString(),
  variants: [
    {
      variantId: 'gid://shopify/ProductVariant/n1',
      title: 'natural',
      image: null,
      sku: null,
      available: true,
      stoneOrigin: 'natural',
      originEvidence: [],
      price: moneyFromMinor(372962),
      compareAtPrice: null,
      metal: 'srebro',
      size: null,
      selectedOptions: [],
    },
    {
      variantId: 'gid://shopify/ProductVariant/l1',
      title: 'lab',
      image: null,
      sku: null,
      available: true,
      stoneOrigin: 'lab_grown',
      originEvidence: [],
      price: moneyFromMinor(400114),
      compareAtPrice: null,
      metal: 'srebro',
      size: null,
      selectedOptions: [],
    },
    {
      variantId: 'gid://shopify/ProductVariant/nm',
      title: 'no metal',
      image: null,
      sku: null,
      available: true,
      stoneOrigin: 'natural',
      originEvidence: [],
      price: moneyFromMinor(10000),
      compareAtPrice: null,
      metal: null,
      size: null,
      selectedOptions: [],
    },
  ],
  priceRange: {min: moneyFromMinor(10000), max: moneyFromMinor(400114), isFlat: false},
};

describe('facts filter (variant-level)', () => {
  it('origin natural returns only natural variants and price range', () => {
    const matches = filterProducts([sample], {origin: ['natural']});
    expect(matches).toHaveLength(1);
    expect(matches[0].matchingVariants.every((v) => v.stoneOrigin === 'natural')).toBe(true);
    expect(matches[0].matchingPriceRange.min.minor).toBe(10000);
    expect(matches[0].matchingPriceRange.max.minor).toBe(372962);
  });

  it('metal filter excludes null metal; combined metal+origin+price on same variant', () => {
    const matches = filterProducts([sample], {
      metal: ['srebro'],
      origin: ['natural'],
      priceMax: moneyFromMinor(380000),
    });
    expect(matches[0].matchingVariantIds).toEqual(['gid://shopify/ProductVariant/n1']);
  });

  it('facets count products', () => {
    const matches = filterProducts([sample], {origin: ['natural']});
    const facets = computeFacetsFromMatches(matches);
    expect(facets.total).toBe(1);
    expect(facets.byOrigin.natural).toBe(1);
    expect(facets.byProductType['Pierścionki']).toBe(1);
  });
});
