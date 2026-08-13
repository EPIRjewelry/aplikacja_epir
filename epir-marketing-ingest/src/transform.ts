import type {
  GmcFeedRow,
  InternalProductRow,
  MappingConfig,
  ShopifyConfig,
  ShopifyProduct,
} from './types.js';
import { buildProductUrl } from './shopify_client.js';
import { openRouterChat, resolveOpenRouterModels } from './openrouter.js';
import {
  classifyMetalLabel,
  GOLD_LABEL,
  SILVER_LABEL,
} from './metal-label.js';

/** GMC `color` from metal line — never invent a colour when metal is unknown. */
export function metalLabelToGmcColor(metalLabel: string): string {
  if (metalLabel === SILVER_LABEL) return 'Silver';
  if (metalLabel === GOLD_LABEL) return 'Gold';
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function metafield(product: ShopifyProduct, key: string): string {
  return product.metafields[key]?.trim() ?? '';
}

function sanitizeTitleBase(title: string): string {
  return title
    .replace(/\s*[–-]\s*\[[^\]]*gid:\/\/shopify\/[^\]]*\]\s*/gi, '')
    .replace(/\[[^\]]*gid:\/\/shopify\/[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeMetafieldText(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('[') || value.includes('gid://shopify/')) {
    return '';
  }
  return value;
}

function humanizeCraftsmanship(raw: string): string {
  return sanitizeMetafieldText(raw);
}

function normalizeLeadTime(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function matchesAnyPattern(text: string, patterns: string[]): boolean {
  const normalized = normalizeLeadTime(text);
  return patterns.some((p) => normalized.includes(normalizeLeadTime(p)));
}

export function classifyMarginLabel(
  row: InternalProductRow,
  mapping: MappingConfig,
): string {
  const { marginRules: rules } = mapping;
  const tags = row.tags.map((t) => t.toLowerCase());

  if (rules.heroTags.some((tag) => tags.includes(tag.toLowerCase()))) {
    return rules.labels.hero;
  }
  if (
    rules.heroProductTypes.some(
      (pt) => pt.toLowerCase() === row.productType.toLowerCase(),
    )
  ) {
    return rules.labels.hero;
  }
  if (
    rules.heroVendors?.some(
      (vendor) => vendor.toLowerCase() === row.brand.toLowerCase(),
    ) &&
    row.tags.some((t) => ['bestseller', 'best-seller', 'forest'].includes(t.toLowerCase()))
  ) {
    return rules.labels.hero;
  }

  const price = Number.parseFloat(row.price);
  let marginRatio: number | null = null;
  if (rules.useUnitCostWhenAvailable && row.unitCost) {
    const cost = Number.parseFloat(row.unitCost);
    if (cost > 0 && price > cost) {
      marginRatio = (price - cost) / price;
    }
  }

  if (
    price >= rules.highMarginMinPrice &&
    (marginRatio === null || marginRatio >= rules.highMarginMinRatio)
  ) {
    return rules.labels.high;
  }
  if (
    price >= rules.mediumMarginMinPrice &&
    (marginRatio === null || marginRatio >= rules.mediumMarginMinRatio)
  ) {
    return rules.labels.medium;
  }
  return rules.labels.low;
}

export function classifyAvailabilityLabel(
  row: InternalProductRow,
  mapping: MappingConfig,
): string {
  const { availabilityRules: rules } = mapping;
  const leadTime =
    row.leadTime.trim() ||
    mapping.availabilityRules.defaultLeadTime?.trim() ||
    '';

  if (matchesAnyPattern(leadTime, rules.leadTimePatterns['3to5'])) {
    return rules.labels.ship3to5;
  }
  if (matchesAnyPattern(leadTime, rules.leadTimePatterns['7plus'])) {
    return rules.labels.madeToOrder;
  }
  if (!row.availableForSale || row.inventoryQty <= 0) {
    return rules.labels.madeToOrder;
  }
  return rules.labels.ship3to5;
}

export function resolveGoogleProductCategory(
  row: InternalProductRow,
  mapping: MappingConfig,
): string {
  if (row.googleCategoryMetafield) {
    return row.googleCategoryMetafield;
  }
  for (const collection of row.collections) {
    const hit = mapping.googleProductCategory.byCollection[collection];
    if (hit) return hit;
  }
  const byType = mapping.googleProductCategory.byProductType[row.productType];
  if (byType) return byType;
  return mapping.googleProductCategory.default;
}

export function enrichTitleRules(
  row: InternalProductRow,
  mapping: MappingConfig,
): string {
  const parts: string[] = [];
  const base = sanitizeTitleBase(row.title.trim());
  parts.push(base);

  const gem = sanitizeMetafieldText(row.gemType || row.gemstoneTypeTaxonomy);
  const material = sanitizeMetafieldText(row.material || row.jewelryMaterialTaxonomy);

  if (gem && !base.toLowerCase().includes(gem.toLowerCase())) {
    parts.push(`z ${gem}`);
  }
  if (material && !base.toLowerCase().includes(material.toLowerCase())) {
    parts.push(material);
  }
  if (row.craftsmanship) {
    const craft = humanizeCraftsmanship(row.craftsmanship);
    if (craft) parts.push(craft);
  }
  if (parts.length === 1) {
    parts.push(mapping.titleEnrichment.craftsmanshipSuffix);
  }

  const joined = parts
    .join(' – ')
    .replace(/\s+–\s+–\s+/g, ' – ')
    .replace(/\s+/g, ' ')
    .trim();

  return truncate(joined, mapping.titleEnrichment.maxLength);
}

export async function enrichTitleWithAi(
  row: InternalProductRow,
  mapping: MappingConfig,
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || !mapping.titleEnrichment.aiEnabled) return null;

  const context = JSON.stringify(
    {
      title: row.title,
      productType: row.productType,
      gemType: row.gemType || row.gemstoneTypeTaxonomy,
      material: row.material || row.jewelryMaterialTaxonomy,
      craftsmanship: row.craftsmanship,
      collections: row.collections,
      tags: row.tags,
    },
    null,
    2,
  );

  const prompt = mapping.titleEnrichment.aiPromptTemplate.replace('{context}', context);
  const models = resolveOpenRouterModels(mapping);

  const result = await openRouterChat(prompt, models, {
    maxTokens: 120,
    temperature: 0.4,
  });
  if (!result) return null;

  const title = result.text.replace(/^["']|["']$/g, '');
  return truncate(title, mapping.titleEnrichment.maxLength);
}

export function enrichDescription(
  row: InternalProductRow,
  mapping: MappingConfig,
): string {
  const plain = stripHtml(row.descriptionHtml);
  if (!plain) {
    const gem = row.gemType || row.gemstoneTypeTaxonomy;
    const material = row.material || row.jewelryMaterialTaxonomy;
    return truncate(
      `${row.title}. ${material ? `Materiał: ${material}.` : ''} ${gem ? `Kamień: ${gem}.` : ''} ${mapping.titleEnrichment.craftsmanshipSuffix}.`,
      5000,
    );
  }
  return truncate(plain, 5000);
}

export function toInternalRow(
  product: ShopifyProduct,
  variant: ShopifyProduct['variants'][number],
  shopifyConfig: ShopifyConfig,
): InternalProductRow {
  return {
    productId: product.id,
    variantId: variant.id,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    productUrl: buildProductUrl(product, shopifyConfig),
    imageUrl: variant.imageUrl ?? product.featuredImageUrl ?? '',
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    unitCost: variant.unitCost,
    inventoryQty: variant.inventoryQuantity,
    availableForSale: variant.availableForSale,
    brand: product.vendor || shopifyConfig.brand,
    productType: product.productType,
    tags: product.tags,
    collections: product.collections,
    gemType: sanitizeMetafieldText(metafield(product, 'custom.main_stone')),
    material: sanitizeMetafieldText(metafield(product, 'custom.metal')),
    craftsmanship: humanizeCraftsmanship(metafield(product, 'custom.design_style')),
    leadTime: metafield(product, 'custom.czas_dostawy'),
    gemstoneTypeTaxonomy: metafield(product, 'shopify.gemstone-type'),
    jewelryMaterialTaxonomy: metafield(product, 'shopify.jewelry-material'),
    googleCategoryMetafield: metafield(
      product,
      'mm-google-shopping.google_product_category',
    ),
    existingCustomLabel0:
      variant.metafields['mm-google-shopping.custom_label_0']?.trim() ||
      metafield(product, 'mm-google-shopping.custom_label_0'),
    existingCustomLabel1:
      variant.metafields['mm-google-shopping.custom_label_1']?.trim() ||
      metafield(product, 'mm-google-shopping.custom_label_1'),
    existingCustomLabel2:
      variant.metafields['mm-google-shopping.custom_label_2']?.trim() ||
      metafield(product, 'mm-google-shopping.custom_label_2'),
  };
}

/** Shopify storefront deep-link to a specific variant. */
export function buildGmcVariantLink(productUrl: string, variantId: string): string {
  const base = productUrl.trim();
  const vid = String(variantId).trim();
  if (!base || !vid) return base;
  try {
    const url = new URL(base);
    url.searchParams.set('variant', vid);
    return url.toString();
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}variant=${encodeURIComponent(vid)}`;
  }
}

function formatGmcPrice(amount: string, currency = 'PLN'): string {
  const value = Number.parseFloat(amount);
  if (Number.isNaN(value)) return `0.00 ${currency}`;
  return `${value.toFixed(2)} ${currency}`;
}

function gmcAvailability(
  row: InternalProductRow,
  mapping: MappingConfig,
): GmcFeedRow['availability'] {
  const availabilityLabel = classifyAvailabilityLabel(row, mapping);
  if (availabilityLabel === mapping.availabilityRules.labels.madeToOrder) {
    return 'preorder';
  }
  if (
    availabilityLabel === mapping.availabilityRules.labels.ship3to5 &&
    row.availableForSale
  ) {
    return row.inventoryQty > 0 ? 'in stock' : 'preorder';
  }
  if (!row.availableForSale || row.inventoryQty <= 0) {
    return 'out of stock';
  }
  return 'in stock';
}

export async function transformProductToGmcRows(
  product: ShopifyProduct,
  shopifyConfig: ShopifyConfig,
  mapping: MappingConfig,
  options?: { useAi?: boolean },
): Promise<GmcFeedRow[]> {
  const rows: GmcFeedRow[] = [];

  for (const variant of product.variants) {
    const internal = toInternalRow(product, variant, shopifyConfig);

    let title = enrichTitleRules(internal, mapping);
    if (options?.useAi !== false) {
      const aiTitle = await enrichTitleWithAi(internal, mapping);
      if (aiTitle) title = aiTitle;
    }

    const metalLabel =
      internal.existingCustomLabel2 ||
      classifyMetalLabel(internal.brand, internal.title);

    rows.push({
      id: `shopify_PL_${internal.variantId}`,
      title,
      description: enrichDescription(internal, mapping),
      link: buildGmcVariantLink(internal.productUrl, internal.variantId),
      image_link: internal.imageUrl,
      price: formatGmcPrice(internal.price),
      availability: gmcAvailability(internal, mapping),
      brand: internal.brand,
      identifier_exists: 'no',
      color: metalLabelToGmcColor(metalLabel),
      google_product_category: resolveGoogleProductCategory(internal, mapping),
      custom_label_0:
        internal.existingCustomLabel0 ||
        classifyMarginLabel(internal, mapping),
      custom_label_1:
        internal.existingCustomLabel1 ||
        classifyAvailabilityLabel(internal, mapping),
      custom_label_2: metalLabel,
    });
  }

  return rows;
}

export async function transformProducts(
  products: ShopifyProduct[],
  shopifyConfig: ShopifyConfig,
  mapping: MappingConfig,
  options?: { useAi?: boolean },
): Promise<GmcFeedRow[]> {
  const all: GmcFeedRow[] = [];
  for (const product of products) {
    const rows = await transformProductToGmcRows(
      product,
      shopifyConfig,
      mapping,
      options,
    );
    all.push(...rows);
  }
  return all;
}
