import type {CollectionEnhancedFlat} from '@epir/ui';

export const SILVER_ZARECZYNY_HANDLE = 'zareczyny-srebrne';

/**
 * Lookbook z metaobjectu może zawierać zdjęcia złota współdzielone z hubem —
 * na podkolekcji srebrnej nie pokazujemy siatki lookbook.
 */
export function enhancedDataForCollectionHero(
  collectionHandle: string,
  enhancedData: CollectionEnhancedFlat | null,
): CollectionEnhancedFlat | null {
  if (
    !enhancedData ||
    collectionHandle !== SILVER_ZARECZYNY_HANDLE ||
    enhancedData.lookbookImages.length === 0
  ) {
    return enhancedData;
  }
  return {...enhancedData, lookbookImages: []};
}
