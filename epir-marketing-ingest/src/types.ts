export interface ShopifyVariant {
  id: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  unitCost: string | null;
  inventoryQuantity: number;
  availableForSale: boolean;
  imageUrl: string | null;
  metafields: Record<string, string>;
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  onlineStoreUrl: string | null;
  featuredImageUrl: string | null;
  vendor: string;
  productType: string;
  tags: string[];
  collections: string[];
  variants: ShopifyVariant[];
  metafields: Record<string, string>;
}

export interface InternalProductRow {
  productId: string;
  variantId: string;
  title: string;
  descriptionHtml: string;
  productUrl: string;
  imageUrl: string;
  price: string;
  compareAtPrice: string | null;
  unitCost: string | null;
  inventoryQty: number;
  availableForSale: boolean;
  brand: string;
  productType: string;
  tags: string[];
  collections: string[];
  gemType: string;
  material: string;
  craftsmanship: string;
  leadTime: string;
  gemstoneTypeTaxonomy: string;
  jewelryMaterialTaxonomy: string;
  googleCategoryMetafield: string;
  existingCustomLabel0: string;
  existingCustomLabel1: string;
  existingCustomLabel2: string;
}

export interface GmcFeedRow {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  price: string;
  availability: 'in stock' | 'out of stock' | 'preorder';
  brand: string;
  /** Hand-made: no GTIN — GMC expects `no` when identifiers are absent */
  identifier_exists: 'yes' | 'no';
  /** GMC color — Silver/Gold from metal classification; empty if unknown */
  color: string;
  google_product_category: string;
  custom_label_0: string;
  custom_label_1: string;
  /** Srebro | Zloto — linia metalu EPIR (PMax listing groups) */
  custom_label_2: string;
}

export interface ShopifyConfig {
  store: string;
  apiVersion: string;
  brand: string;
  storefrontBaseUrl: string;
  productQuery: string;
  metafieldNamespaces: string[];
  metafieldKeys: string[];
  variantMetafieldNamespace: string;
  pageSize: number;
  variantsPageSize: number;
  throttleMs: number;
}

export interface SheetsConfig {
  spreadsheetId: string;
  tabName: string;
  clearRange: string;
  writeRange: string;
}

export interface R2Config {
  bucket: string;
  objectKey: string;
  publicFeedUrl: string;
}

export interface OutputConfig {
  defaultSink: 'r2' | 'csv' | 'sheets';
  localCsvBackup: boolean;
  sheetsEnabled: boolean;
}

export interface MappingConfig {
  gmcColumns: string[];
  shopifyToInternal: Record<string, string>;
  googleProductCategory: {
    default: string;
    byProductType: Record<string, string>;
    byCollection: Record<string, string>;
  };
  marginRules: {
    heroTags: string[];
    heroProductTypes: string[];
    heroVendors?: string[];
    highMarginMinPrice: number;
    highMarginMinRatio: number;
    mediumMarginMinPrice: number;
    mediumMarginMinRatio: number;
    useUnitCostWhenAvailable?: boolean;
    labels: {
      hero: string;
      high: string;
      medium: string;
      low: string;
    };
  };
  availabilityRules: {
    defaultLeadTime?: string;
    labels: {
      ship3to5: string;
      madeToOrder: string;
    };
    leadTimePatterns: {
      '3to5': string[];
      '7plus': string[];
    };
  };
  titleEnrichment: {
    craftsmanshipSuffix: string;
    maxLength: number;
    aiEnabled: boolean;
    aiModels?: string[];
    aiPromptTemplate: string;
  };
}

export interface PipelineResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  productsFetched: number;
  rowsWritten: number;
  outputTarget: 'sheets' | 'csv' | 'r2' | 'r2+csv' | 'none';
  outputPath?: string;
  publicFeedUrl?: string;
  errors: string[];
}
