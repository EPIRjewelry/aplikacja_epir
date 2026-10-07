/**
 * Normalizacja surowych odpowiedzi GraphQL (Admin / Storefront) do ProductFacts.
 * Zero importów z src/catalog/*. Pochodzenie nigdy z tagów, tytułu ani regexu opisu.
 */
import type {
  DataIssue,
  GemstoneOrigin,
  MoneyPln,
  OriginEvidence,
  ProductFacts,
  ProductImageFact,
  VariantFacts,
} from './types';
import { isSizeOption, isMetalOption, isQualityOption } from './field-mapping';
import { QUALITY_OPTION_TO_ORIGIN, PRODUCT_METAFIELD_ORIGIN } from './origin-mapping';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function parsePln(node: unknown): MoneyPln | undefined {
  if (!isRecord(node)) return undefined;
  const amount = node.amount ?? node.price;
  const code = asStr(node.currencyCode) ?? asStr(node.currency);
  if (code && code !== 'PLN') return undefined;
  let minor: number;
  if (typeof amount === 'number') {
    minor = Math.round(amount * 100);
  } else if (typeof amount === 'string') {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed)) return undefined;
    minor = Math.round(parsed * 100);
  } else {
    return undefined;
  }
  const display = (minor / 100).toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' zł';
  return { amount_minor: minor, display_pl: display };
}

function readImage(node: unknown): ProductImageFact | undefined {
  if (!isRecord(node)) return undefined;
  const url = asStr(node.url) ?? asStr(node.src);
  if (url) return { url, alt: asStr(node.altText) ?? asStr(node.alt) };
  const img = isRecord(node.image) ? node.image : isRecord(node.featuredImage) ? node.featuredImage : null;
  if (img) {
    const u = asStr(img.url) ?? asStr(img.src);
    if (u) return { url: u, alt: asStr(img.altText) ?? asStr(img.alt) };
  }
  return undefined;
}

function variantNodes(product: Record<string, unknown>): Record<string, unknown>[] {
  const v = product.variants;
  if (Array.isArray(v)) return v.filter(isRecord);
  if (isRecord(v) && Array.isArray(v.nodes)) return v.nodes.filter(isRecord);
  if (isRecord(v) && Array.isArray(v.edges)) {
    return v.edges.map((e) => (isRecord(e) && isRecord(e.node) ? e.node : e)).filter(isRecord);
  }
  return [];
}

function optionsList(variant: Record<string, unknown>): Array<{ name: string; value: string }> {
  const raw = variant.options ?? variant.selectedOptions ?? variant.selected_options;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name: string; value: string }> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = asStr(item.name);
    const value = asStr(item.value) ?? asStr(item.label);
    if (name && value) out.push({ name, value });
  }
  return out;
}

function collectionHandles(product: Record<string, unknown>): string[] {
  const col = product.collections;
  const handles: string[] = [];
  const push = (node: unknown) => {
    if (!isRecord(node)) return;
    const h = asStr(node.handle);
    if (h) handles.push(h);
  };
  if (Array.isArray(col)) col.forEach(push);
  else if (isRecord(col) && Array.isArray(col.nodes)) col.nodes.forEach(push);
  return handles;
}

function plainText(html: unknown): string | undefined {
  if (typeof html !== 'string') return undefined;
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || undefined;
}

function resolveVariantOrigin(
  variant: Record<string, unknown>,
  product: Record<string, unknown>,
  issues: DataIssue[],
  variantId: string,
): { origin: GemstoneOrigin; evidence?: OriginEvidence } {
  const opts = optionsList(variant);

  // Step 1: quality option
  const qualityOpt = opts.find((o) => isQualityOption(o.name));
  if (qualityOpt) {
    const normalized = qualityOpt.value.trim().toLowerCase();
    const mapped = QUALITY_OPTION_TO_ORIGIN.get(normalized);
    if (mapped) {
      return { origin: mapped, evidence: { source: 'variant_option', raw_value: qualityOpt.value } };
    }
    issues.push({
      field: 'variant_option_quality',
      message: `Unknown quality option value: "${qualityOpt.value}"`,
      variant_id: variantId,
    });
    return { origin: 'unknown', evidence: { source: 'variant_option', raw_value: qualityOpt.value } };
  }

  // Step 2: product metafield custom.gemstone_origin
  const metafields = readMetafields(product);
  const gemOrigin = metafields.find(
    (m) => m.key === 'gemstone_origin' || m.fullKey === 'custom.gemstone_origin',
  );
  if (gemOrigin?.value) {
    const normalized = gemOrigin.value.trim().toLowerCase();
    const mapped = PRODUCT_METAFIELD_ORIGIN.get(normalized);
    if (mapped) {
      if (mapped === 'unknown' || mapped === 'mixed') {
        return { origin: mapped, evidence: { source: 'product_metafield', raw_value: gemOrigin.value } };
      }
      return { origin: mapped, evidence: { source: 'product_metafield', raw_value: gemOrigin.value } };
    }
  }

  return { origin: 'unknown' };
}

type MetafieldEntry = { key: string; fullKey?: string; value: string };

function readMetafields(product: Record<string, unknown>): MetafieldEntry[] {
  const raw = product.metafields;
  const nodes: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) {
    for (const n of raw) if (isRecord(n)) nodes.push(n);
  } else if (isRecord(raw) && Array.isArray(raw.nodes)) {
    for (const n of raw.nodes) if (isRecord(n)) nodes.push(n);
  }
  const out: MetafieldEntry[] = [];
  for (const n of nodes) {
    const key = asStr(n.key);
    const ns = asStr(n.namespace);
    const value = asStr(n.value);
    if (!key || !value) continue;
    out.push({ key, fullKey: ns ? `${ns}.${key}` : key, value });
  }
  return out;
}

export type NormalizeOptions = {
  channel: 'epir' | 'kazka';
  urlTemplate?: string;
};

export function normalizeProduct(
  raw: unknown,
  options: NormalizeOptions,
): ProductFacts | null {
  if (!isRecord(raw)) return null;

  const productId = asStr(raw.id) ?? asStr(raw.product_id);
  if (!productId) return null;

  const issues: DataIssue[] = [];
  const variants: VariantFacts[] = [];

  for (const v of variantNodes(raw)) {
    const vId = asStr(v.id) ?? asStr(v.variant_id);
    if (!vId) continue;
    const opts = optionsList(v);
    const size = opts.find((o) => isSizeOption(o.name))?.value ?? null;
    const metal = opts.find((o) => isMetalOption(o.name))?.value ?? null;
    const price = parsePln(v.price ?? v);
    const available =
      typeof v.availableForSale === 'boolean'
        ? v.availableForSale
        : typeof v.available === 'boolean'
          ? v.available
          : true;
    const { origin, evidence } = resolveVariantOrigin(v, raw, issues, vId);

    variants.push({
      variant_id: vId,
      title: asStr(v.title),
      sku: asStr(v.sku),
      available,
      price,
      metal,
      size,
      origin,
      origin_evidence: evidence,
      image: readImage(v),
      options: opts.length ? opts : undefined,
    });
  }

  let url: string | null = null;
  if (options.channel === 'epir') {
    const storeUrl = asStr(raw.onlineStoreUrl);
    url = storeUrl ?? null;
    if (!storeUrl) {
      issues.push({
        field: 'onlineStoreUrl',
        message: 'Product has no onlineStoreUrl — not published on Online Store.',
        product_id: productId,
      });
    }
  } else if (options.channel === 'kazka') {
    const handle = asStr(raw.handle);
    if (handle && options.urlTemplate) {
      url = options.urlTemplate.replace('{handle}', handle);
    }
  }

  const descriptionText =
    plainText(raw.descriptionHtml) ??
    plainText(raw.description) ??
    plainText(raw.body_html);

  if (options.channel === 'epir' && !url) {
    return null;
  }

  return {
    product_id: productId,
    handle: asStr(raw.handle),
    title: asStr(raw.title) ?? asStr(raw.name),
    descriptionText,
    url,
    vendor: asStr(raw.vendor),
    collections: collectionHandles(raw),
    image: readImage(raw),
    variants,
    issues,
  };
}
