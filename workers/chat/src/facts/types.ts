/** Cena w PLN — grosze (minor units). */
export type MoneyPln = {
  amount_minor: number;
  display_pl: string;
};

export type GemstoneOrigin = 'natural' | 'lab_grown' | 'cultured' | 'mixed' | 'unknown';

export type OriginEvidence = {
  source: 'variant_option' | 'variant_metafield' | 'product_metafield';
  raw_value: string;
};

export type DataIssue = {
  field: string;
  message: string;
  product_id?: string;
  variant_id?: string;
};

export type VariantFacts = {
  variant_id: string;
  title?: string;
  sku?: string;
  available: boolean;
  price?: MoneyPln;
  metal?: string | null;
  size?: string | null;
  origin?: GemstoneOrigin;
  origin_evidence?: OriginEvidence;
  image?: ProductImageFact;
  options?: Array<{ name: string; value: string }>;
};

export type ProductImageFact = {
  url: string;
  alt?: string;
};

export type ProductFacts = {
  product_id: string;
  handle?: string;
  title?: string;
  descriptionText?: string;
  url?: string | null;
  vendor?: string;
  collections: string[];
  image?: ProductImageFact;
  variants: VariantFacts[];
  issues: DataIssue[];
};

export type ProductMatch = {
  product: ProductFacts;
  matchingVariants: VariantFacts[];
  matchingPriceRange?: { min: MoneyPln; max: MoneyPln };
  isFlat: boolean;
};

export type CatalogFilters = {
  text?: string;
  origin?: GemstoneOrigin[];
  metal?: string[];
  priceMin?: number;
  priceMax?: number;
  sizeMin?: string;
  sizeMax?: string;
  available?: boolean;
};

export type CatalogFacets = {
  origins: Map<GemstoneOrigin, number>;
  metals: Map<string, number>;
  priceRange?: { min: number; max: number };
  totalProducts: number;
};

export type CatalogFacetsDto = {
  total: number;
  byOrigin: Record<GemstoneOrigin, number>;
  byStone: Record<string, number>;
  byMetal: Record<string, number>;
  byProductType: Record<string, number>;
};

export type BuyerChannelId = 'epir-online-store' | 'kazka-hydrogen';

export interface CatalogFactsRepository {
  readonly channel: BuyerChannelId;
  status(): Promise<{
    available: boolean;
    reason?: 'no_token' | 'no_snapshot' | 'fetch_error';
    fetchedAt?: string;
  }>;
  search(
    filters: CatalogFilters,
    limit: number,
  ): Promise<{matches: ProductMatch[]; total: number; facets: CatalogFacetsDto}>;
  facets(filters?: CatalogFilters): Promise<CatalogFacetsDto>;
  getById(productId: string): Promise<ProductFacts | null>;
  getByHandle(handle: string): Promise<ProductFacts | null>;
}
