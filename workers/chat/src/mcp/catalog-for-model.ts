/**
 * Karta katalogu dla modelu.
 *
 * Storefront Catalog MCP zwraca produkty w `result.structuredContent`
 * (ceny UCP w jednostkach minor: 280000 = 2 800 PLN) plus często kopię w `content[].text`.
 * Pełny payload (opisy, media, warianty rozmiarów) po obcięciu do okna narzędzi
 * zostawia tytuł i ucina cenę. Model ma cytować wyłącznie `price_display_pl`,
 * więc bez tego pola odsyła na kartę produktu albo kręci kolejne lookupy.
 */

import { plnDisplayFromUcpMoney } from './catalog-price-enrich';

const MAX_VARIANTS = 6;
const MAX_OPTION_LABELS = 12;
/** Chat truncates tool JSON at 3000 chars. Stay under that so the cut never splits a price. */
const MODEL_WIRE_BUDGET = 2700;
const PRICE_NOTE =
  'Cytuj wyłącznie price_display_pl. Do koszyka użyj variant_id (gid://shopify/ProductVariant/…).';

type PlnPrice = {
  currency: 'PLN';
  price_minor: number;
  price_display_pl: string;
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

function productPrice(product: Record<string, unknown>): PlnPrice | null {
  const range = isRecord(product.price_range) ? product.price_range : null;
  return (
    priceOf(range?.min) ??
    priceOf(range?.max) ??
    priceOf(product.price) ??
    priceOf(product.minVariantPrice) ??
    null
  );
}

function variantList(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants;
  if (Array.isArray(variants)) return variants.filter(isRecord);
  if (isRecord(variants) && Array.isArray(variants.nodes)) return variants.nodes.filter(isRecord);
  return [];
}

function variantAvailable(variant: Record<string, unknown>): boolean | undefined {
  if (typeof variant.available === 'boolean') return variant.available;
  const availability = variant.availability;
  if (isRecord(availability) && typeof availability.available === 'boolean') return availability.available;
  return undefined;
}

function optionsSummary(product: Record<string, unknown>): string | undefined {
  if (!Array.isArray(product.options)) return undefined;
  const parts: string[] = [];
  for (const option of product.options) {
    if (!isRecord(option)) continue;
    const name = asString(option.name);
    const values = Array.isArray(option.values) ? option.values : [];
    const labels = values
      .map((value) => (isRecord(value) ? asString(value.label) : asString(value)))
      .filter((label): label is string => Boolean(label))
      .slice(0, MAX_OPTION_LABELS);
    if (name && labels.length) parts.push(`${name}: ${labels.join(', ')}`);
  }
  if (!parts.length) return undefined;
  const summary = parts.join(' | ');
  return summary.length > 180 ? `${summary.slice(0, 177)}…` : summary;
}

function slimVariant(variant: Record<string, unknown>, compact: boolean): Record<string, unknown> {
  const price = priceOf(variant.price) ?? priceOf(variant);
  const available = variantAvailable(variant);
  const out: Record<string, unknown> = {};
  const id = asString(variant.id) ?? asString(variant.variant_id);
  const title = asString(variant.title);
  const sku = asString(variant.sku);
  if (id) out.id = id;
  if (title) out.title = title;
  if (!compact && sku) out.sku = sku;
  if (available !== undefined) out.available = available;
  if (price) {
    out.price_display_pl = price.price_display_pl;
    if (!compact) {
      out.price_minor = price.price_minor;
      out.currency = price.currency;
    }
  }
  return out;
}

function slimProduct(
  product: Record<string, unknown>,
  maxVariants: number,
  compact: boolean,
): Record<string, unknown> {
  const price = productPrice(product);
  const variantsAll = variantList(product);
  const variants = variantsAll.slice(0, maxVariants).map((variant) => slimVariant(variant, compact));
  const featured =
    variants.find((variant) => variant.available !== false && typeof variant.id === 'string') ??
    variants.find((variant) => typeof variant.id === 'string');
  const out: Record<string, unknown> = {};
  const id = asString(product.id);
  const title = asString(product.title) ?? asString(product.name);
  const handle = asString(product.handle);
  const url = asString(product.url) ?? asString(product.onlineStoreUrl);
  if (id) out.id = id;
  if (title) out.title = title;
  if (price) {
    out.price_display_pl = price.price_display_pl;
    if (!compact) {
      out.price_minor = price.price_minor;
      out.currency = price.currency;
    }
  }
  if (featured && typeof featured.id === 'string') out.variant_id = featured.id;
  if (!compact && handle) out.handle = handle;
  if (url) out.url = url;
  const vendor = asString(product.vendor);
  if (!compact && vendor) out.vendor = vendor;
  if (!compact && Array.isArray(product.tags)) {
    const tags = product.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
    if (tags.length) out.tags = tags;
  }
  const summary = optionsSummary(product);
  if (summary) out.options_summary = summary;
  if (variants.length) out.variants = variants;
  if (variantsAll.length > variants.length) out.more_variants = variantsAll.length - variants.length;
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
  if (hasProducts) unique.push(PRICE_NOTE);
  if (!unique.length) return undefined;
  return unique.join(' ');
}

function asModelContent(payload: Record<string, unknown>): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function packWithinBudget(payloadFor: (maxVariants: number, compact: boolean) => Record<string, unknown>) {
  let maxVariants = MAX_VARIANTS;
  let compact = false;
  let packed = asModelContent(payloadFor(maxVariants, compact));
  while (JSON.stringify(packed).length > MODEL_WIRE_BUDGET && maxVariants > 1) {
    maxVariants -= 1;
    packed = asModelContent(payloadFor(maxVariants, compact));
  }
  if (JSON.stringify(packed).length > MODEL_WIRE_BUDGET) {
    compact = true;
    packed = asModelContent(payloadFor(1, compact));
  }
  return packed;
}

/**
 * Zwraca krótki JSON w `content[0].text`: tytuł, price_display_pl, variant_id.
 * Surowy `amount` (jednostki minor) nie trafia do modelu.
 */
export function presentCatalogForModel(result: unknown): unknown {
  if (!isRecord(result) || result.isError === true) return result;
  const bodies = catalogBodies(result).filter(isRecord);
  if (!bodies.length) return result;

  if (bodies.length === 1 && isSingleProductBody(bodies[0])) {
    const body = bodies[0];
    return packWithinBudget((maxVariants, compact) => {
      const product = isRecord(body.product) ? slimProduct(body.product, maxVariants, compact) : null;
      const payload: Record<string, unknown> = { product };
      const note = systemNote([body], Boolean(product && product.price_display_pl));
      if (note) payload.system_note = note;
      return payload;
    });
  }

  const collected: Record<string, unknown>[] = [];
  for (const body of bodies) pushProducts(body, collected);
  const rawProducts = dedupeProducts(collected);
  return packWithinBudget((maxVariants, compact) => {
    const products = rawProducts.map((product) => slimProduct(product, maxVariants, compact));
    const payload: Record<string, unknown> = { products };
    const note = systemNote(
      bodies,
      products.some((product) => typeof product.price_display_pl === 'string'),
    );
    if (note) payload.system_note = note;
    return payload;
  });
}
