import type {CollectionEnhancedFlat} from '@epir/ui';

export const SILVER_ZARECZYNY_HANDLE = 'zareczyny-srebrne';

/**
 * Lookbook z metaobjectu może zawierać zdjęcia złota współdzielone z hubem —
 * na podkolekcji srebrnej nie pokazujemy lookbooku ani współdzielonego pasa wideo/tekstury z huba.
 */
export function enhancedDataForCollectionHero(
  collectionHandle: string,
  enhancedData: CollectionEnhancedFlat | null,
): CollectionEnhancedFlat | null {
  if (!enhancedData || collectionHandle !== SILVER_ZARECZYNY_HANDLE) {
    return enhancedData;
  }
  return {
    ...enhancedData,
    lookbookImages: [],
    heroVideoUrl: null,
    textureOverlayUrl: null,
    accentColor: null,
  };
}
