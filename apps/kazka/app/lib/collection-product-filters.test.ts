import {describe, expect, it} from 'vitest';
import {
  parseCollectionProductFilters,
  parseCollectionSort,
} from './collection-product-filters';

describe('parseCollectionProductFilters', () => {
  it('maps metal CSV to jewelry-material and ignores silver', () => {
    const params = new URLSearchParams(
      'metal=zloto-zolte,zloto-biale&metal=srebro',
    );
    expect(parseCollectionProductFilters(params)).toEqual([
      {
        taxonomyMetafield: {
          namespace: 'shopify',
          key: 'jewelry-material',
          value: 'Yellow gold',
        },
      },
      {
        taxonomyMetafield: {
          namespace: 'shopify',
          key: 'jewelry-material',
          value: 'White gold',
        },
      },
    ]);
  });

  it('maps proba and jakosc to variantOption', () => {
    const params = new URLSearchParams('proba=14&jakosc=LAB');
    expect(parseCollectionProductFilters(params)).toEqual([
      {variantOption: {name: 'Próba złota', value: '14 karatów'}},
      {variantOption: {name: 'Jakość', value: 'LAB'}},
    ]);
  });

  it('maps laboratoryjny alias and quality grades', () => {
    const params = new URLSearchParams('jakosc=laboratoryjny,D/VVS2');
    expect(parseCollectionProductFilters(params)).toEqual([
      {variantOption: {name: 'Jakość', value: 'LAB'}},
      {variantOption: {name: 'Jakość', value: 'D/VVS2'}},
    ]);
  });

  it('maps ksztalt to tag and waga to custom.masa_bucket', () => {
    const params = new URLSearchParams('ksztalt=Okrągły&waga=0.2-0.5');
    expect(parseCollectionProductFilters(params)).toEqual([
      {tag: 'Okrągły'},
      {
        productMetafield: {
          namespace: 'custom',
          key: 'masa_bucket',
          value: '0.2-0.5g',
        },
      },
    ]);
  });

  it('maps type to productType and ignores legacy stone', () => {
    const params = new URLSearchParams('stone=brylant&type=Naszyjnik');
    expect(parseCollectionProductFilters(params)).toEqual([
      {productType: 'Naszyjnik'},
    ]);
  });

  it('maps price range and available', () => {
    const params = new URLSearchParams(
      'price_min=2000&price_max=6000&available=true',
    );
    expect(parseCollectionProductFilters(params)).toEqual([
      {price: {min: 2000, max: 6000}},
      {available: true},
    ]);
  });

  it('ignores invalid price numbers', () => {
    const params = new URLSearchParams('price_min=abc&price_max=-1');
    expect(parseCollectionProductFilters(params)).toEqual([]);
  });
});

describe('parseCollectionSort', () => {
  it('maps sort query to sortKey/reverse', () => {
    expect(parseCollectionSort(new URLSearchParams('sort=price_asc'))).toEqual({
      sortKey: 'PRICE',
      reverse: false,
    });
    expect(parseCollectionSort(new URLSearchParams('sort=price_desc'))).toEqual(
      {
        sortKey: 'PRICE',
        reverse: true,
      },
    );
    expect(parseCollectionSort(new URLSearchParams('sort=newest'))).toEqual({
      sortKey: 'CREATED',
      reverse: true,
    });
    expect(parseCollectionSort(new URLSearchParams())).toEqual({
      sortKey: 'COLLECTION_DEFAULT',
      reverse: false,
    });
  });
});
