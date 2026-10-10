/** Cena w PLN — grosze (minor units). */
export type MoneyPln = {
  minor: number;
  currency: 'PLN';
  /** Prefiks display — opcjonalny dla UI. */
  display_pl?: string;
  /** Alias kompatybilności ze starszymi testami. */
  amount_minor?: number;
};

export type VariantStoneOrigin = 'natural' | 'lab_grown' | 'cultured' | 'mixed' | 'unknown';
/** @deprecated alias */
export type GemstoneOrigin = VariantStoneOrigin;

export type OriginEvidence =
  | {source: 'variant_option'; optionName: string; value: string}
  | {source: 'variant_metafield'; key: string; value: string}
  | {source: 'product_metafield'; key: string; value: string};

export type DataIssue =
  | {kind: 'origin_unknown'; variantIds: string[]}
  | {kind: 'origin_conflict'; detail: string}
  | {kind: 'unknown_quality_value'; value: string}
  | {kind: 'missing_product_type'}
  | {kind: 'vendor_channel_mismatch'; vendor: string}
  | {kind: 'missing_storefront_metafield_access'; key: string}
  | {kind: 'missing_availability'; variantId: string}
  | {kind: 'origin_choice_unresolved'; detail: string}
  /** Kompatybilność: starsze testy używały field/message */
  | {field: string; message: string; product_id?: string; variant_id?: string};

export type ProductImageFact = {
  url: string;
  alt: string | null;
};

export type VariantFacts = {
  variantId: string;
  title: string;
  image: ProductImageFact | null;
  sku: string | null;
  /** Storefront ProductVariant.weight */
  weight?: number | null;
  weightUnit?: string | null;
  price: MoneyPln;
  compareAtPrice: MoneyPln | null;
  available: boolean;
  selectedOptions: {name: string; value: string}[];
  metal: string | null;
  size: string | null;
  stoneOrigin: VariantStoneOrigin;
  originEvidence: OriginEvidence[];
  /** Metapola wariantu (poziom wariantu — osobno od produktu). */
  variantMetafields?: Record<string, string>;
  /** Alias snake_case dla kompatybilności testów */
  variant_id?: string;
  origin?: VariantStoneOrigin;
  origin_evidence?: OriginEvidence;
};

export type ProductFacts = {
  channel: BuyerChannelId;
  productId: string;
  handle: string;
  title: string;
  vendor: string;
  productType: string | null;
  url: string;
  image: ProductImageFact | null;
  collections: {handle: string; title: string}[];
  descriptionText: string;
  options: {name: string; values: string[]}[];
  variants: VariantFacts[];
  priceRange: {min: MoneyPln; max: MoneyPln; isFlat: boolean};
  stones: string[];
  metals: string[];
  sizes: string[];
  metafields: Record<string, string | string[]>;
  productOriginRaw: string | null;
  dataIssues: DataIssue[];
  fetchedAt: string;
  /** Aliasy kompatybilności */
  product_id?: string;
  issues?: DataIssue[];
};

export type CatalogFilters = {
  text?: string;
  productType?: string[];
  stone?: string[];
  origin?: VariantStoneOrigin[];
  metal?: string[];
  priceMin?: MoneyPln | number;
  priceMax?: MoneyPln | number;
  /** Przekazywane do UCP catalog.context.intent (nie od modelu jako osobne pole API poza search). */
  ucpIntent?: string;
  size?: string;
  availableOnly?: boolean;
  available?: boolean;
};

export type CatalogSearchMeta = {
  filterIgnored?: string[];
};

export type CatalogSearchResult = {
  matches: ProductMatch[];
  total: number;
  facets: CatalogFacetsDto;
  meta?: CatalogSearchMeta;
};

export type ProductMatch = {
  product: ProductFacts;
  matchingVariantIds: string[];
  matchingVariants: VariantFacts[];
  matchingPriceRange: {min: MoneyPln; max: MoneyPln; isFlat: boolean};
  isFlat: boolean;
};

export type CatalogFacetsDto = {
  total: number;
  byOrigin: Record<VariantStoneOrigin, number>;
  byStone: Record<string, number>;
  byMetal: Record<string, number>;
  byProductType: Record<string, number>;
};

/** @deprecated — używaj CatalogFacetsDto */
export type CatalogFacets = CatalogFacetsDto & {
  origins?: Map<VariantStoneOrigin, number>;
  metals?: Map<string, number>;
  totalProducts?: number;
};

export type BuyerChannelId = 'epir-online-store' | 'kazka-hydrogen' | 'epir-zareczyny';

export interface CatalogFactsRepository {
  readonly channel: BuyerChannelId;
  status(): Promise<{
    available: boolean;
    reason?: 'no_token' | 'fetch_error';
    fetchedAt?: string;
  }>;
  search(
    filters: CatalogFilters,
    limit: number,
  ): Promise<CatalogSearchResult>;
  getById(productId: string): Promise<ProductFacts | null>;
}

function moneyFromMinor(minor: number): MoneyPln {
  const display =
    (minor / 100).toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' zł';
  return {minor, currency: 'PLN', display_pl: display, amount_minor: minor};
}

export {moneyFromMinor};
