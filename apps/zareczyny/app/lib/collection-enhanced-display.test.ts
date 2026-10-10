import {describe, expect, it} from 'vitest';
import {
  SILVER_ZARECZYNY_HANDLE,
  enhancedDataForCollectionHero,
} from './collection-enhanced-display';
import type {CollectionEnhancedFlat} from '@epir/ui';

const sampleEnhanced = (): CollectionEnhancedFlat => ({
  name: 'Srebrne',
  philosophy: null,
  accentColor: '#ccc',
  heroVideoUrl: null,
  textureOverlayUrl: null,
  lookbookImages: [
    'https://cdn.shopify.com/gold-1.jpg',
    'https://cdn.shopify.com/gold-2.jpg',
  ],
});

describe('enhancedDataForCollectionHero', () => {
  it('clears lookbook on silver subcollection', () => {
    const result = enhancedDataForCollectionHero(
      SILVER_ZARECZYNY_HANDLE,
      sampleEnhanced(),
    );
    expect(result?.lookbookImages).toEqual([]);
    expect(result?.heroVideoUrl).toBeNull();
    expect(result?.textureOverlayUrl).toBeNull();
    expect(result?.accentColor).toBeNull();
    expect(result?.name).toBe('Srebrne');
  });

  it('keeps lookbook on gold subcollection', () => {
    const input = sampleEnhanced();
    const result = enhancedDataForCollectionHero('zareczyny-zlote', input);
    expect(result?.lookbookImages).toEqual(input.lookbookImages);
  });

  it('returns null when enhanced data is null', () => {
    expect(
      enhancedDataForCollectionHero(SILVER_ZARECZYNY_HANDLE, null),
    ).toBeNull();
  });
});
