import type {ProductFacts, ProductMatch} from '../../../src/facts/types';
import {moneyFromMinor} from '../../../src/facts/types';
import {filterProducts} from '../../../src/facts/filter';

/** Fikcyjne produkty — kształt jak live Storefront, bez prawdziwych handleów sklepu. */
export function fictionalMultiVariantProduct(): ProductFacts {
  return {
    channel: 'epir-online-store',
    productId: 'gid://shopify/Product/900001',
    handle: 'fikcyjny-pierscionek-parity',
    title: 'Fikcyjny pierścionek parity',
    vendor: 'EPIR Fikcja',
    productType: 'Pierścionki',
    url: 'https://example.test/products/fikcyjny-pierscionek-parity',
    image: null,
    collections: [],
    descriptionText: '',
    options: [],
    stones: ['fikcyjny szafir'],
    metals: ['złoto 585'],
    sizes: [],
    metafields: {},
    productOriginRaw: null,
    dataIssues: [],
    fetchedAt: new Date().toISOString(),
    variants: [
      {
        variantId: 'gid://shopify/ProductVariant/900001-a',
        title: 'drogi wariant',
        image: null,
        sku: null,
        available: true,
        stoneOrigin: 'natural',
        originEvidence: [],
        price: moneyFromMinor(500_000),
        compareAtPrice: null,
        metal: 'złoto 585',
        size: null,
        selectedOptions: [],
      },
      {
        variantId: 'gid://shopify/ProductVariant/900001-b',
        title: 'tani wariant',
        image: null,
        sku: null,
        available: true,
        stoneOrigin: 'natural',
        originEvidence: [],
        price: moneyFromMinor(120_000),
        compareAtPrice: null,
        metal: 'złoto 585',
        size: null,
        selectedOptions: [],
      },
      {
        variantId: 'gid://shopify/ProductVariant/900001-c',
        title: 'średni wariant',
        image: null,
        sku: null,
        available: true,
        stoneOrigin: 'natural',
        originEvidence: [],
        price: moneyFromMinor(250_000),
        compareAtPrice: null,
        metal: 'złoto 585',
        size: null,
        selectedOptions: [],
      },
    ],
    priceRange: {
      min: moneyFromMinor(120_000),
      max: moneyFromMinor(500_000),
      isFlat: false,
    },
  };
}

export function fictionalMatchFromProduct(product: ProductFacts, filters = {}): ProductMatch {
  const matches = filterProducts([product], filters);
  return matches[0]!;
}

export function fictionalTaggedProduct(id: string, tagged: boolean): ProductFacts {
  const base = fictionalMultiVariantProduct();
  return {
    ...base,
    productId: id,
    handle: `fikcyjny-${id.split('/').pop()}`,
    title: `Fikcyjny produkt ${id.split('/').pop()}`,
    url: `https://example.test/products/fikcyjny-${id.split('/').pop()}`,
    collections: tagged ? [] : [{handle: 'inne', title: 'Inne'}],
  };
}
