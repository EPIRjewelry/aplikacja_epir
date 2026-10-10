/**
 * Normalizacja surowych odpowiedzi GraphQL (Admin / Storefront) do ProductFacts.
 * Zero importów z src/catalog/*. Pochodzenie nigdy z tagów, tytułu ani regexu opisu.
 */
import type {
  BuyerChannelId,
  DataIssue,
  MoneyPln,
  OriginEvidence,
  ProductFacts,
  ProductImageFact,
  VariantFacts,
  VariantStoneOrigin,
} from './types';
import {moneyFromMinor} from './types';
import {isSizeOption, isMetalOption, isQualityOption, VARIANT_ORIGIN_METAFIELD_KEYS} from './field-mapping';
import {QUALITY_OPTION_TO_ORIGIN, PRODUCT_METAFIELD_ORIGIN} from './origin-mapping';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function parsePln(node: unknown): MoneyPln | undefined {
  if (typeof node === 'string' || typeof node === 'number') {
    const parsed = typeof node === 'number' ? node : parseFloat(String(node).replace(',', '.'));
    if (!Number.isFinite(parsed)) return undefined;
    return moneyFromMinor(Math.round(parsed * 100));
  }
  if (!isRecord(node)) return undefined;
  const amount = node.amount ?? node.price;
  const code = asStr(node.currencyCode) ?? asStr(node.currency) ?? 'PLN';
  if (code !== 'PLN') return undefined;
  let minor: number;
  if (typeof amount === 'number') minor = Math.round(amount * 100);
  else if (typeof amount === 'string') {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed)) return undefined;
    minor = Math.round(parsed * 100);
  } else return undefined;
  return moneyFromMinor(minor);
}

function readImage(node: unknown): ProductImageFact | null {
  if (!isRecord(node)) return null;
  const url = asStr(node.url) ?? asStr(node.src);
  if (url) return {url, alt: asStr(node.altText) ?? asStr(node.alt) ?? null};
  const img = isRecord(node.image)
    ? node.image
    : isRecord(node.featuredImage)
      ? node.featuredImage
      : isRecord(node.featuredMedia) && isRecord((node.featuredMedia as {preview?: unknown}).preview)
        ? ((node.featuredMedia as {preview: {image?: unknown}}).preview.image ?? null)
        : null;
  if (isRecord(img)) {
    const u = asStr(img.url) ?? asStr(img.src);
    if (u) return {url: u, alt: asStr(img.altText) ?? asStr(img.alt) ?? null};
  }
  return null;
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

function optionsList(variant: Record<string, unknown>): Array<{name: string; value: string}> {
  const raw = variant.options ?? variant.selectedOptions ?? variant.selected_options;
  if (!Array.isArray(raw)) return [];
  const out: Array<{name: string; value: string}> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = asStr(item.name);
    const value = asStr(item.value) ?? asStr(item.label);
    if (name && value) out.push({name, value});
  }
  return out;
}

function collectionNodes(product: Record<string, unknown>): {handle: string; title: string}[] {
  const col = product.collections;
  const out: {handle: string; title: string}[] = [];
  const push = (node: unknown) => {
    if (!isRecord(node)) return;
    const h = asStr(node.handle);
    if (h) out.push({handle: h, title: asStr(node.title) ?? h});
  };
  if (Array.isArray(col)) col.forEach(push);
  else if (isRecord(col) && Array.isArray(col.nodes)) col.nodes.forEach(push);
  return out;
}

function plainText(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

type MetafieldEntry = {key: string; fullKey: string; value: string; namespace?: string};

function readMetafields(node: Record<string, unknown>): MetafieldEntry[] {
  const raw = node.metafields;
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
    out.push({key, namespace: ns, fullKey: ns ? `${ns}.${key}` : key, value});
  }
  return out;
}

function productOptions(product: Record<string, unknown>): {name: string; values: string[]}[] {
  const raw = product.options;
  if (!Array.isArray(raw)) return [];
  const out: {name: string; values: string[]}[] = [];
  for (const o of raw) {
    if (!isRecord(o)) continue;
    const name = asStr(o.name);
    if (!name) continue;
    const values = Array.isArray(o.values)
      ? o.values.filter((v): v is string => typeof v === 'string')
      : [];
    out.push({name, values});
  }
  return out;
}

function resolveVariantOrigin(
  variant: Record<string, unknown>,
  product: Record<string, unknown>,
  issues: DataIssue[],
  variantId: string,
): {origin: VariantStoneOrigin; evidence: OriginEvidence[]; productOriginRaw: string | null} {
  const evidence: OriginEvidence[] = [];
  const opts = optionsList(variant);
  let fromOption: VariantStoneOrigin | null = null;
  let fromVariantMf: VariantStoneOrigin | null = null;
  let fromProduct: VariantStoneOrigin | null = null;
  let productOriginRaw: string | null = null;

  const qualityOpt = opts.find((o) => isQualityOption(o.name));
  if (qualityOpt) {
    const normalized = qualityOpt.value.trim().toLowerCase();
    const mapped = QUALITY_OPTION_TO_ORIGIN.get(normalized);
    evidence.push({
      source: 'variant_option',
      optionName: qualityOpt.name,
      value: qualityOpt.value,
    });
    if (mapped) {
      fromOption = mapped;
    } else {
      issues.push({kind: 'unknown_quality_value', value: qualityOpt.value});
      fromOption = 'unknown';
    }
  }

  const vMfs = readMetafields(variant);
  for (const allowed of VARIANT_ORIGIN_METAFIELD_KEYS) {
    const hit = vMfs.find(
      (m) =>
        m.key === allowed.key &&
        (!allowed.namespace || m.namespace === allowed.namespace || m.fullKey === `${allowed.namespace}.${allowed.key}`),
    );
    if (!hit) continue;
    evidence.push({source: 'variant_metafield', key: hit.fullKey, value: hit.value});
    const mapped = PRODUCT_METAFIELD_ORIGIN.get(hit.value.trim().toLowerCase());
    if (mapped) fromVariantMf = mapped;
  }

  const pMfs = readMetafields(product);
  const gemOrigin = pMfs.find(
    (m) => m.key === 'gemstone_origin' || m.fullKey === 'custom.gemstone_origin',
  );
  if (gemOrigin?.value) {
    productOriginRaw = gemOrigin.value;
    evidence.push({
      source: 'product_metafield',
      key: gemOrigin.fullKey,
      value: gemOrigin.value,
    });
    const normalized = gemOrigin.value.trim().toLowerCase();
    const mapped = PRODUCT_METAFIELD_ORIGIN.get(normalized);
    if (mapped === 'unknown') {
      // do wyboru — rozstrzygają kroki 1–2
      if (!fromOption && !fromVariantMf) {
        issues.push({
          kind: 'origin_choice_unresolved',
          detail: 'product metafield do wyboru without variant origin',
        });
        fromProduct = 'unknown';
      }
    } else if (mapped === 'mixed') {
      fromProduct = fromOption || fromVariantMf ? null : 'mixed';
      if (!fromOption && !fromVariantMf) fromProduct = 'mixed';
    } else if (mapped) {
      fromProduct = mapped;
    }
  }

  const specific = fromOption ?? fromVariantMf;
  if (specific && fromProduct && specific !== fromProduct && fromProduct !== 'unknown' && fromProduct !== 'mixed') {
    issues.push({
      kind: 'origin_conflict',
      detail: `variant=${specific} vs product=${fromProduct} (${variantId})`,
    });
  }

  const origin = specific ?? fromProduct ?? 'unknown';
  if (origin === 'unknown' && !fromOption && !fromVariantMf && !fromProduct) {
    issues.push({kind: 'origin_unknown', variantIds: [variantId]});
  }

  return {origin, evidence, productOriginRaw};
}

export type NormalizeOptions = {
  channel: BuyerChannelId | 'epir' | 'kazka';
  urlTemplate?: string;
  fetchedAt?: string;
};

function resolveChannel(ch: NormalizeOptions['channel']): BuyerChannelId {
  if (ch === 'epir') return 'epir-online-store';
  if (ch === 'kazka') return 'kazka-hydrogen';
  return ch;
}

export function normalizeProduct(raw: unknown, options: NormalizeOptions): ProductFacts | null {
  if (!isRecord(raw)) return null;

  const productId = asStr(raw.id) ?? asStr(raw.product_id);
  if (!productId) return null;

  const channel = resolveChannel(options.channel);
  const issues: DataIssue[] = [];
  const variants: VariantFacts[] = [];
  let productOriginRaw: string | null = null;

  for (const v of variantNodes(raw)) {
    const vId = asStr(v.id) ?? asStr(v.variant_id);
    if (!vId) continue;
    const opts = optionsList(v);
    const size = opts.find((o) => isSizeOption(o.name))?.value ?? null;
    const metal = opts.find((o) => isMetalOption(o.name))?.value ?? null;
    const price = parsePln(v.price ?? v) ?? moneyFromMinor(0);
    const compareAtPrice = parsePln(v.compareAtPrice) ?? null;
    let available: boolean;
    if (typeof v.availableForSale === 'boolean') {
      available = v.availableForSale;
    } else if (typeof v.available === 'boolean') {
      available = v.available;
    } else {
      available = false;
      issues.push({kind: 'missing_availability', variantId: vId});
    }

    const resolved = resolveVariantOrigin(v, raw, issues, vId);
    if (resolved.productOriginRaw) productOriginRaw = resolved.productOriginRaw;

    const weightRaw = v.weight;
    const weight =
      typeof weightRaw === 'number' && Number.isFinite(weightRaw)
        ? weightRaw
        : typeof weightRaw === 'string' && weightRaw.trim() && Number.isFinite(Number(weightRaw))
          ? Number(weightRaw)
          : null;
    const weightUnit = asStr(v.weightUnit) ?? null;

    variants.push({
      variantId: vId,
      variant_id: vId,
      title: asStr(v.title) ?? '',
      sku: asStr(v.sku) ?? null,
      weight,
      weightUnit,
      available,
      price,
      compareAtPrice,
      metal,
      size,
      stoneOrigin: resolved.origin,
      origin: resolved.origin,
      originEvidence: resolved.evidence,
      origin_evidence: resolved.evidence[0],
      image: readImage(v),
      selectedOptions: opts,
    });
  }

  let url = '';
  if (channel === 'epir-online-store' || channel === 'epir-zareczyny') {
    const storeUrl = asStr(raw.onlineStoreUrl);
    if (!storeUrl) return null;
    url = storeUrl;
  } else {
    const handle = asStr(raw.handle);
    if (handle && options.urlTemplate) {
      url = options.urlTemplate.replace('{handle}', handle);
    }
  }

  const productType = asStr(raw.productType) ?? asStr(raw.product_type) ?? null;
  if (!productType) issues.push({kind: 'missing_product_type'});

  const metals = [...new Set(variants.map((v) => v.metal).filter((m): m is string => Boolean(m)))];
  const sizes = [...new Set(variants.map((v) => v.size).filter((s): s is string => Boolean(s)))];
  // stones z metapól — dopiero po inwentaryzacji
  const stones: string[] = [];

  const prices = variants.map((v) => v.price.minor);
  const minMinor = prices.length ? Math.min(...prices) : 0;
  const maxMinor = prices.length ? Math.max(...prices) : 0;

  const metafields: Record<string, string | string[]> = {};
  for (const m of readMetafields(raw)) {
    if (m.fullKey === 'custom.gemstone_origin' || m.key === 'gemstone_origin') {
      metafields[m.fullKey] = m.value;
    }
  }

  const facts: ProductFacts = {
    channel,
    productId,
    product_id: productId,
    handle: asStr(raw.handle) ?? '',
    title: asStr(raw.title) ?? asStr(raw.name) ?? '',
    vendor: asStr(raw.vendor) ?? '',
    productType,
    url,
    image: readImage(raw),
    collections: collectionNodes(raw),
    descriptionText: plainText(raw.descriptionHtml) || plainText(raw.description) || plainText(raw.body_html),
    options: productOptions(raw),
    variants,
    priceRange: {
      min: moneyFromMinor(minMinor),
      max: moneyFromMinor(maxMinor),
      isFlat: minMinor === maxMinor,
    },
    stones,
    metals,
    sizes,
    metafields,
    productOriginRaw,
    dataIssues: issues,
    issues,
    fetchedAt: options.fetchedAt ?? new Date().toISOString(),
  };
  return facts;
}
