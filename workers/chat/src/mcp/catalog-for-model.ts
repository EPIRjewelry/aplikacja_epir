/**
 * Karta katalogu dla modelu.
 *
 * Model czyta wyłącznie ten JSON. Ma tu być cała karta SKU: opis, rozwinięte
 * metafieldy (bez wysyłki, próby i graweru — to osobny przebieg), każdy wariant
 * z własną ceną i pełna lista rozmiarów. Zakres ceny jest na karcie tylko wtedy,
 * gdy warianty naprawdę różnią się ceną. Płaska cena zostaje jedną kwotą.
 * Pierwszy wariant nie jest całą ofertą.
 *
 * Link produktu jest na hoście marki rozmowy (EPIR apex albo Kazka).
 */

import {isEpirCatalogBrand, isKazkaCatalogBrand} from '../catalog/kazka-assortment';
import {kazkaLeadTimePhrase} from '../catalog/kazka-lead-time';
import {stripForeignBrandLinks} from '../brand-reply-host';
import {plnDisplayFromUcpMoney} from './catalog-price-enrich';

/** Chat trzyma wynik narzędzia katalogu do tej długości, żeby cięcie nie rozcięło ceny. */
export const CATALOG_MODEL_WIRE_BUDGET = 24000;
const DESCRIPTION_MAX = 900;
const METAFIELD_VALUE_MAX = 240;
const MAX_METAFIELDS = 8;

const CARD_NOTE =
  'Karta jest całą ofertą tego SKU. Gdy price_is_flat jest true, cytuj wyłącznie price_display_pl (to samo co page_price_display_pl) i pełną listę sizes — cena nie zależy od rozmiaru. Zakres podawaj tylko gdy price_is_flat jest false: page_price_display_pl oraz price_min_display_pl–price_max_display_pl, a konkretną kwotę bierz z wariantu. Nie traktuj pierwszego wariantu jako całej oferty. Nie dopisuj kamienia, rozmiaru ani cechy spoza tej karty i nie przenoś ich z innego SKU. Wariant chwal tylko za options tego wariantu. Rozmiary podawaj z sizes, bez przeliczenia na inną skalę. Link wyłącznie z pola url. Do koszyka użyj id wariantu, który klient wybrał.';

/** Publiczne PDP. Apex to Online Store; Kazka jest na subdomenie Hydrogen, nie na apex. */
const EPIR_PRODUCT_ORIGIN = 'https://epirbizuteria.pl';
const KAZKA_PRODUCT_ORIGIN = 'https://kazka.epirbizuteria.pl';

const SIZE_OPTION_RE = /rozmiar|size|wielko/i;
const LATER_PASS_METAFIELD_RE = /wysy[lł]|dostaw|shipping|delivery|grawer|engrav|fineness|pr[oó]ba|metal_purity/i;

type PlnPrice = {
  currency: 'PLN';
  price_minor: number;
  price_display_pl: string;
};

type SlimBudget = {
  descriptionMax: number;
  includeMetafields: boolean;
  variantDetail: boolean;
};

type NamedOption = {name: string; value: string};

const FULL_BUDGET: SlimBudget = {
  descriptionMax: DESCRIPTION_MAX,
  includeMetafields: true,
  variantDetail: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function priceOf(node: unknown): PlnPrice | null {
  if (!isRecord(node)) return null;
  return plnDisplayFromUcpMoney(node);
}

function sameMinor(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

function plainFromRich(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const stripped = value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return stripped || undefined;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => plainFromRich(item))
      .filter((item): item is string => Boolean(item))
      .join(' ')
      .trim();
    return joined || undefined;
  }
  if (!isRecord(value)) return undefined;
  return (
    plainFromRich(value.plain) ??
    plainFromRich(value.text) ??
    plainFromRich(value.html) ??
    plainFromRich(value.value) ??
    plainFromRich(value.children)
  );
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return '';
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function variantList(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants;
  if (Array.isArray(variants)) return variants.filter(isRecord);
  if (isRecord(variants) && Array.isArray(variants.nodes)) return variants.nodes.filter(isRecord);
  if (isRecord(variants) && Array.isArray(variants.edges)) {
    return variants.edges
      .map((edge) => (isRecord(edge) && isRecord(edge.node) ? edge.node : edge))
      .filter(isRecord);
  }
  return [];
}

function variantAvailable(variant: Record<string, unknown>): boolean | undefined {
  if (typeof variant.available === 'boolean') return variant.available;
  if (typeof variant.availableForSale === 'boolean') return variant.availableForSale;
  const availability = variant.availability;
  if (isRecord(availability) && typeof availability.available === 'boolean') return availability.available;
  return undefined;
}

function variantOptions(variant: Record<string, unknown>): NamedOption[] {
  const raw = variant.options ?? variant.selectedOptions ?? variant.selected_options;
  if (!Array.isArray(raw)) return [];
  const out: NamedOption[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = asString(item.name);
    const value = asString(item.value) ?? asString(item.label);
    if (name && value) out.push({name, value});
  }
  return out;
}

function optionGroups(product: Record<string, unknown>): Array<{name: string; values: string[]}> {
  if (!Array.isArray(product.options)) return [];
  const groups: Array<{name: string; values: string[]}> = [];
  for (const option of product.options) {
    if (!isRecord(option)) continue;
    const name = asString(option.name);
    const values = Array.isArray(option.values) ? option.values : [];
    const labels = values
      .map((value) => (isRecord(value) ? asString(value.label) ?? asString(value.value) : asString(value)))
      .filter((label): label is string => Boolean(label));
    if (name && labels.length) groups.push({name, values: labels});
  }
  return groups;
}

function sizeList(
  groups: Array<{name: string; values: string[]}>,
  variants: Record<string, unknown>[],
): string[] | undefined {
  const named = groups.find((group) => SIZE_OPTION_RE.test(group.name));
  if (named?.values.length) return named.values;
  const fromVariants: string[] = [];
  for (const variant of variants) {
    const size = variantOptions(variant).find((option) => SIZE_OPTION_RE.test(option.name));
    if (size) fromVariants.push(size.value);
  }
  return fromVariants.length ? fromVariants : undefined;
}

function rangeEnds(product: Record<string, unknown>): {min: PlnPrice | null; max: PlnPrice | null} {
  const range = isRecord(product.price_range)
    ? product.price_range
    : isRecord(product.priceRange)
      ? product.priceRange
      : null;
  if (!range) {
    return {
      min: priceOf(product.price) ?? priceOf(product.minVariantPrice),
      max: priceOf(product.maxVariantPrice),
    };
  }
  return {
    min: priceOf(range.min) ?? priceOf(range.minVariantPrice) ?? priceOf(product.price),
    max: priceOf(range.max) ?? priceOf(range.maxVariantPrice),
  };
}

function isLaterPassMetafield(key: string): boolean {
  return LATER_PASS_METAFIELD_RE.test(key);
}

function metafieldNodes(product: Record<string, unknown>): Record<string, unknown>[] {
  const raw = product.metafields;
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (!isRecord(raw)) return [];
  if (Array.isArray(raw.nodes)) return raw.nodes.filter(isRecord);
  if (Array.isArray(raw.edges)) {
    return raw.edges
      .map((edge) => (isRecord(edge) && isRecord(edge.node) ? edge.node : edge))
      .filter(isRecord);
  }
  return [];
}

function expandedMetafieldValue(node: Record<string, unknown>): string | undefined {
  const reference = isRecord(node.reference)
    ? node.reference
    : isRecord(node.metaobject)
      ? node.metaobject
      : null;
  if (reference && Array.isArray(reference.fields)) {
    const parts: string[] = [];
    for (const field of reference.fields) {
      if (!isRecord(field)) continue;
      const key = asString(field.key);
      const value = plainFromRich(field.value);
      if (!key || !value || value.startsWith('gid://')) continue;
      if (isLaterPassMetafield(key)) continue;
      parts.push(`${key}: ${value}`);
    }
    if (parts.length) return parts.join('; ');
  }
  const direct = plainFromRich(node.value);
  if (!direct || direct.startsWith('gid://')) return undefined;
  return direct;
}

function metafieldKey(node: Record<string, unknown>): string | undefined {
  const key = asString(node.key);
  const namespace = asString(node.namespace);
  if (namespace && key) return `${namespace}.${key}`;
  return key;
}

function cardMetafields(product: Record<string, unknown>): Array<{key: string; value: string}> {
  const out: Array<{key: string; value: string}> = [];
  for (const node of metafieldNodes(product)) {
    const key = metafieldKey(node);
    if (!key || isLaterPassMetafield(key)) continue;
    const value = expandedMetafieldValue(node);
    if (!value) continue;
    out.push({key, value: clip(value, METAFIELD_VALUE_MAX)});
    if (out.length >= MAX_METAFIELDS) break;
  }
  return out;
}

function czasWykonaniaValue(product: Record<string, unknown>, metafields: Array<{key: string; value: string}>): string | undefined {
  const fromList = metafields.find((field) => field.key.endsWith('czas_wykonania'));
  if (fromList) return fromList.value;
  const direct = product.czasWykonania ?? product.czas_wykonania;
  if (isRecord(direct)) return asString(direct.value);
  return asString(direct);
}

function readUrlString(value: unknown): string | undefined {
  const direct = asString(value);
  if (direct) return direct;
  if (!isRecord(value)) return undefined;
  return asString(value.href) ?? asString(value.url) ?? asString(value.onlineStoreUrl);
}

function productOrigin(brand?: string): string | null {
  if (isKazkaCatalogBrand(brand)) return KAZKA_PRODUCT_ORIGIN;
  if (!brand || isEpirCatalogBrand(brand)) return EPIR_PRODUCT_ORIGIN;
  return null;
}

function productPath(raw: string | undefined, handle: string | undefined): string | undefined {
  if (raw) {
    try {
      const parsed = new URL(raw);
      const path = parsed.pathname.replace(/\/+$/, '');
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        parsed.hostname &&
        path.startsWith('/products/') &&
        path.length > '/products/'.length
      ) {
        return path;
      }
    } catch {
      /* sam schemat, np. "https://", nie ma hosta ani ścieżki */
    }
    const relative = raw.split(/[?#]/)[0] ?? '';
    if (relative.startsWith('/products/') && relative.length > '/products/'.length) {
      return relative.replace(/\/+$/, '');
    }
  }
  const slug = handle?.trim();
  if (!slug || slug.includes('/') || /\s/.test(slug)) return undefined;
  return `/products/${slug}`;
}

/**
 * Shop MCP zwraca URL Online Store (apex) dla obu kanałów.
 * Karta Kazki dostaje ten sam path na hoście kazka.epirbizuteria.pl.
 * EPIR zostaje na apex. Sam schemat bez hosta nie przechodzi.
 */
function absoluteProductUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (!parsed.hostname || !path.startsWith('/products/') || path.length <= '/products/'.length) return undefined;
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch {
    return undefined;
  }
}

function catalogProductUrl(product: Record<string, unknown>, brand?: string): string | undefined {
  const raw = readUrlString(product.url) ?? readUrlString(product.onlineStoreUrl);
  const path = productPath(raw, asString(product.handle));
  const origin = productOrigin(brand);
  if (origin && path) return `${origin}${path}`;
  return absoluteProductUrl(raw);
}

function scrub(text: string, brand?: string): string {
  return stripForeignBrandLinks(text, brand).text;
}

function slimVariant(variant: Record<string, unknown>, detail: boolean): Record<string, unknown> {
  const price = priceOf(variant.price) ?? priceOf(variant);
  const available = variantAvailable(variant);
  const options = variantOptions(variant);
  const out: Record<string, unknown> = {};
  const id = asString(variant.id) ?? asString(variant.variant_id);
  const title = asString(variant.title);
  const sku = asString(variant.sku);
  if (id) out.id = id;
  if (title) out.title = title;
  if (detail && sku) out.sku = sku;
  if (available !== undefined) out.available = available;
  if (price) out.price_display_pl = price.price_display_pl;
  if (detail && options.length) out.options = options;
  return out;
}

function slimProduct(
  product: Record<string, unknown>,
  budget: SlimBudget,
  brand?: string,
): Record<string, unknown> {
  const variantsAll = variantList(product);
  const variantPrices = variantsAll
    .map((variant) => priceOf(variant.price) ?? priceOf(variant))
    .filter((price): price is PlnPrice => Boolean(price));
  const range = rangeEnds(product);
  const compared = variantPrices.length
    ? variantPrices
    : [range.min, range.max].filter((price): price is PlnPrice => Boolean(price));
  const flat = compared.length > 0 && compared.every((price) => sameMinor(price.price_minor, compared[0].price_minor));
  const minPrice = compared.reduce<PlnPrice | null>(
    (best, price) => (!best || price.price_minor < best.price_minor ? price : best),
    null,
  );
  const maxPrice = compared.reduce<PlnPrice | null>(
    (best, price) => (!best || price.price_minor > best.price_minor ? price : best),
    null,
  );

  const groups = optionGroups(product);
  const sizes = sizeList(groups, variantsAll);
  const allMetafields = cardMetafields(product);
  const metafields = budget.includeMetafields ? allMetafields : [];
  const descriptionRaw = plainFromRich(product.description)
    ?? plainFromRich(product.descriptionHtml)
    ?? plainFromRich(product.body_html)
    ?? plainFromRich(product.bodyHtml);
  const description = descriptionRaw && budget.descriptionMax > 0
    ? scrub(clip(descriptionRaw, budget.descriptionMax), brand)
    : undefined;

  const variants = variantsAll.map((variant) => slimVariant(variant, budget.variantDetail));
  const out: Record<string, unknown> = {};
  const id = asString(product.id);
  const title = asString(product.title) ?? asString(product.name);
  const handle = asString(product.handle);
  const url = catalogProductUrl(product, brand);
  if (id) out.id = id;
  if (title) out.title = title;
  if (handle) out.handle = handle;
  if (url) out.url = url;
  const vendor = asString(product.vendor);
  if (vendor) out.vendor = vendor;
  if (description) out.description = description;

  if (minPrice) {
    out.price_is_flat = flat;
    out.page_price_display_pl = flat ? minPrice.price_display_pl : `od ${minPrice.price_display_pl}`;
    if (flat) {
      out.price_display_pl = minPrice.price_display_pl;
    } else if (maxPrice) {
      out.price_min_display_pl = minPrice.price_display_pl;
      out.price_max_display_pl = maxPrice.price_display_pl;
    }
  }

  if (sizes?.length) out.sizes = sizes;
  if (groups.length) out.options = groups;
  if (metafields.length) {
    out.metafields = metafields.map((field) => ({
      key: field.key,
      value: scrub(field.value, brand),
    }));
  }
  if (isKazkaCatalogBrand(brand)) {
    const tags = Array.isArray(product.tags)
      ? product.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    const lead = kazkaLeadTimePhrase({
      tags,
      metafieldValue: czasWykonaniaValue(product, allMetafields),
    });
    if (lead) out.lead_time_display_pl = lead;
  }
  if (variants.length === 1 && typeof variants[0]?.id === 'string') {
    out.variant_id = variants[0].id;
  }
  if (variants.length) out.variants = variants;
  return out;
}

function hasCatalogShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value.products) || Array.isArray(value.items) || Array.isArray(value.results)) return true;
  if ('product' in value) return true;
  if (isRecord(value.catalog) && Array.isArray(value.catalog.products)) return true;
  return false;
}

function catalogBodies(result: Record<string, unknown>): unknown[] {
  const fromContent: unknown[] = [];
  if (Array.isArray(result.content)) {
    for (const entry of result.content) {
      if (!isRecord(entry) || typeof entry.text !== 'string') continue;
      const text = entry.text.trim();
      if (!text.startsWith('{') && !text.startsWith('[')) continue;
      try {
        const parsed = JSON.parse(text) as unknown;
        if (hasCatalogShape(parsed)) fromContent.push(parsed);
      } catch {
        /* tekst MCP nie jest katalogiem */
      }
    }
  }
  if (fromContent.length) return fromContent;
  if (isRecord(result.structuredContent) && hasCatalogShape(result.structuredContent)) {
    return [result.structuredContent];
  }
  if (hasCatalogShape(result)) return [result];
  return [];
}

function isSingleProductBody(body: unknown): body is Record<string, unknown> {
  return (
    isRecord(body) &&
    'product' in body &&
    !Array.isArray(body.products) &&
    !Array.isArray(body.items) &&
    !Array.isArray(body.results)
  );
}

function pushProducts(body: Record<string, unknown>, into: Record<string, unknown>[]): void {
  const keys = ['products', 'items', 'results'] as const;
  for (const key of keys) {
    const list = body[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (isRecord(item)) into.push(item);
    }
  }
  if (isRecord(body.catalog) && Array.isArray(body.catalog.products)) {
    for (const item of body.catalog.products) {
      if (isRecord(item)) into.push(item);
    }
  }
}

function dedupeProducts(products: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const product of products) {
    const key = asString(product.id) ?? asString(product.handle) ?? asString(product.title) ?? JSON.stringify(product);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(product);
  }
  return out;
}

function systemNote(bodies: Record<string, unknown>[], hasProducts: boolean): string | undefined {
  const notes = bodies
    .map((body) => asString(body.system_note))
    .filter((note): note is string => Boolean(note));
  const unique = [...new Set(notes)];
  if (hasProducts) unique.push(CARD_NOTE);
  if (!unique.length) return undefined;
  return unique.join(' ');
}

function asModelContent(payload: Record<string, unknown>): {content: Array<{type: 'text'; text: string}>} {
  return {content: [{type: 'text', text: JSON.stringify(payload)}]};
}

function packWithinBudget(payloadFor: (budget: SlimBudget) => Record<string, unknown>) {
  const steps: SlimBudget[] = [
    FULL_BUDGET,
    {...FULL_BUDGET, descriptionMax: 400},
    {descriptionMax: 400, includeMetafields: false, variantDetail: true},
    {descriptionMax: 200, includeMetafields: false, variantDetail: false},
    {descriptionMax: 0, includeMetafields: false, variantDetail: false},
  ];
  let packed = asModelContent(payloadFor(steps[0]));
  for (const step of steps.slice(1)) {
    if (JSON.stringify(packed).length <= CATALOG_MODEL_WIRE_BUDGET) break;
    packed = asModelContent(payloadFor(step));
  }
  return packed;
}

/**
 * JSON w `content[0].text`: opis, metafieldy, każdy wariant z ceną, lista rozmiarów.
 * Surowy `amount` (jednostki minor) nie trafia do modelu.
 */
export function presentCatalogForModel(result: unknown, options?: {brand?: string}): unknown {
  if (!isRecord(result) || result.isError === true) return result;
  const bodies = catalogBodies(result).filter(isRecord);
  if (!bodies.length) return result;
  const brand = options?.brand;

  if (bodies.length === 1 && isSingleProductBody(bodies[0])) {
    const body = bodies[0];
    return packWithinBudget((budget) => {
      const product = isRecord(body.product) ? slimProduct(body.product, budget, brand) : null;
      const payload: Record<string, unknown> = {product};
      const note = systemNote([body], Boolean(product));
      if (note) payload.system_note = note;
      return payload;
    });
  }

  const collected: Record<string, unknown>[] = [];
  for (const body of bodies) pushProducts(body, collected);
  const rawProducts = dedupeProducts(collected);
  return packWithinBudget((budget) => {
    const products = rawProducts.map((product) => slimProduct(product, budget, brand));
    const payload: Record<string, unknown> = {products};
    const note = systemNote(bodies, products.length > 0);
    if (note) payload.system_note = note;
    return payload;
  });
}
