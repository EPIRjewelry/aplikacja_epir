import {isLivePublishedProduct, type LiveCatalogChannel} from '../catalog/live-store-product';
import {cardStoneOrigin, originOnCardLabel, type CardStoneOrigin} from '../catalog/stone-origin';
import {plnDisplayFromUcpMoney} from '../mcp/catalog-price-enrich';
import type {ProductFacts, ProductImageFact, VariantFacts} from './types';

const SIZE_OPTION_RE = /rozmiar|size|wielko/i;
const METAL_OPTION_RE = /metal|złot|zlot|materiał|material/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function variantList(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants;
  if (Array.isArray(variants)) return variants.filter(isRecord);
  if (isRecord(variants) && Array.isArray(variants.nodes)) return variants.nodes.filter(isRecord);
  return [];
}

function variantOptions(variant: Record<string, unknown>): Array<{name: string; value: string}> {
  const raw = variant.options ?? variant.selectedOptions ?? variant.selected_options;
  if (!Array.isArray(raw)) return [];
  const out: Array<{name: string; value: string}> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = asString(item.name);
    const value = asString(item.value) ?? asString(item.label);
    if (name && value) out.push({name, value});
  }
  return out;
}

function readImage(node: Record<string, unknown> | undefined): ProductImageFact | undefined {
  if (!node) return undefined;
  const direct = asString(node.url) ?? asString(node.src);
  if (direct) {
    return {url: direct, alt: asString(node.altText) ?? asString(node.alt)};
  }
  const image = node.image;
  if (isRecord(image)) {
    const url = asString(image.url) ?? asString(image.src);
    if (url) return {url, alt: asString(image.altText) ?? asString(image.alt)};
  }
  const featured = node.featuredImage ?? node.featured_image;
  if (isRecord(featured)) {
    const url = asString(featured.url) ?? asString(featured.src);
    if (url) return {url, alt: asString(featured.altText)};
  }
  return undefined;
}

function collectionHandles(product: Record<string, unknown>): string[] {
  const col = product.collections;
  const handles: string[] = [];
  const push = (node: unknown) => {
    if (!isRecord(node)) return;
    const handle = asString(node.handle);
    if (handle) handles.push(handle);
  };
  if (Array.isArray(col)) {
    for (const item of col) push(item);
  } else if (isRecord(col) && Array.isArray(col.nodes)) {
    for (const item of col.nodes) push(item);
  }
  return handles;
}

function variantStoneOrigin(
  variant: Record<string, unknown>,
  product: Record<string, unknown>,
): CardStoneOrigin | undefined {
  return cardStoneOrigin({...product, variants: {nodes: [variant]}});
}

export type NormalizeProductFactsOptions = {
  brand?: string;
  channel?: LiveCatalogChannel;
};

/**
 * Jedna karta produktu dla migawki kanału (etap 1). Nie zawiera SKU ani pól wewnętrznych.
 */
export function normalizeProductFacts(
  raw: unknown,
  options: NormalizeProductFactsOptions = {},
): ProductFacts | null {
  if (!isRecord(raw)) return null;
  const channel = options.channel ?? (options.brand === 'kazka' ? 'kazka' : 'epir');
  if (!isLivePublishedProduct(raw, {channel})) return null;

  const productId = asString(raw.id) ?? asString(raw.product_id);
  if (!productId) return null;

  const variantsRaw = variantList(raw);
  const variants: VariantFacts[] = [];
  for (const variant of variantsRaw) {
    const variantId = asString(variant.id) ?? asString(variant.variant_id);
    if (!variantId) continue;
    const optionsList = variantOptions(variant);
    const size = optionsList.find((o) => SIZE_OPTION_RE.test(o.name))?.value ?? null;
    const metal = optionsList.find((o) => METAL_OPTION_RE.test(o.name))?.value ?? null;
    const price = plnDisplayFromUcpMoney(variant.price ?? variant);
    const available =
      typeof variant.availableForSale === 'boolean'
        ? variant.availableForSale
        : typeof variant.available === 'boolean'
          ? variant.available
          : true;
    variants.push({
      variant_id: variantId,
      title: asString(variant.title),
      available,
      price_display_pl: price?.price_display_pl,
      price_minor: price?.price_minor,
      metal,
      size,
      stone_origin: variantStoneOrigin(variant, raw),
      image: readImage(variant),
      options: optionsList.length ? optionsList : undefined,
    });
  }

  const url =
    asString(raw.onlineStoreUrl) ??
    asString(raw.url) ??
    (isRecord(raw.url) ? asString(raw.url.url) : undefined);

  return {
    product_id: productId,
    handle: asString(raw.handle),
    title: asString(raw.title) ?? asString(raw.name),
    url,
    vendor: asString(raw.vendor),
    collections: collectionHandles(raw),
    image: readImage(raw),
    origin_on_card: originOnCardLabel(raw),
    variants,
  };
}
