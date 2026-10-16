import type {CatalogFilters} from '../../facts/types';
import type {ProductMatch} from '../../facts/types';

/** Filtry wyszukiwania Gemma v2 — budżet nie idzie do UCP (E2b). */
export type GemmaCatalogSearchFilters = Pick<
  CatalogFilters,
  'text' | 'ucpIntent' | 'metal' | 'stone' | 'priceMin' | 'priceMax'
>;

export type GemmaVariantPriceLine = {
  variantId: string;
  label: string;
  displayPl: string;
  minor: number;
};

export type GemmaVariantPriceFacts = {
  lines: GemmaVariantPriceLine[];
  isFlat: boolean;
  /** Zakres tylko gdy warianty mają różne ceny (minor). */
  rangeText: string | null;
};

export type {ProductMatch};
