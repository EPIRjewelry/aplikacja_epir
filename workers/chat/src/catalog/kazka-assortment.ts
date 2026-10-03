/**
 * Twardy filtr asortymentu Kazka dla narzędzi katalogu (search / lookup / image).
 *
 * Reguła kanoniczna (smart kolekcje EPIR i skrypty separacji):
 * produkt jest Kazka, gdy tag == `kazka` LUB vendor == `Kazka`.
 * Reszta (w tym sam tag `kazka-pierscionek` bez `kazka` i bez vendor Kazka) jest EPIR-only
 * i nie może wrócić do Gemmy na kanale Kazka.
 * Odwrotnie: ten sam dowód (tag `kazka` lub vendor `Kazka`) wyklucza produkt z karty EPIR.
 *
 * Shopify Catalog MCP nie filtruje vendora. Dlatego:
 * 1) zapytanie search dostaje klauzulę `tag:kazka OR vendor:Kazka` (parser sklepu),
 * 2) wynik jest docinany po vendor/tagach z payloadu albo po odczycie Admin/Storefront.
 * Brak dowodu = produkt odpada (fail closed).
 */

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_STOREFRONT_API_VERSION,
} from '../config/shopify-api-version';
import {isKazkaHeadlessChannel} from '../storefront/kazka-hydrate';

export const KAZKA_ASSORTMENT_TAG = 'kazka';
export const KAZKA_ASSORTMENT_VENDOR = 'kazka';
export const KAZKA_ASSORTMENT_CLAUSE = '(tag:kazka OR vendor:Kazka)';
/** Ile kandydatów prosimy u MCP, zanim wytniemy nie-Kazka i zostawimy stronę czatu. */
export const KAZKA_CATALOG_SEARCH_CANDIDATES = 10;
/** Tyle produktów katalogu widzi model po filtrze (zgodnie z limitem czatu). */
export const KAZKA_CATALOG_SEARCH_LIMIT = 3;

const PRODUCT_ARRAY_KEYS = new Set(['products', 'items', 'results']);
const SINGLE_PRODUCT_KEYS = new Set(['product', 'selected_product']);
const GID_RE = /^gid:\/\/shopify\/Product(?:Variant)?\/\d+$/;
const TAG_CLAUSE_RE = /(?:^|[\s(])tag:kazka(?:$|[\s)])/i;
const VENDOR_CLAUSE_RE = /(?:^|[\s(])vendor:kazka(?:$|[\s)])/i;

export type KazkaAssortmentEnv = {
  SHOP_DOMAIN?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  PUBLIC_STOREFRONT_API_TOKEN_KAZKA?: string;
};

type MembershipIndex = Map<string, boolean>;

type RefBag = {
  ids: string[];
  handles: string[];
  skus: string[];
};

type FilterStats = {
  kept: number;
  dropped: number;
};

export function isKazkaCatalogBrand(brand?: string): boolean {
  if (!brand) return false;
  const normalized = brand.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'kazka' || isKazkaHeadlessChannel(normalized, normalized);
}

export function isEpirCatalogBrand(brand?: string): boolean {
  if (!brand) return false;
  const normalized = brand.trim().toLowerCase();
  return (
    normalized === 'epir' ||
    normalized === 'online-store' ||
    normalized === 'epir-liquid' ||
    normalized === 'epirbizuteria.pl'
  );
}

/**
 * Marka przekazywana do Shop MCP z pętli narzędzi czatu.
 * storefrontId kazka/zareczyny ma pierwszeństwo (jak dotychczas), potem kanał Kazka i brand.
 */
export function resolveCatalogToolBrand(input: {
  storefrontId?: string;
  channel?: string;
  brand?: string;
}): string | undefined {
  if (input.storefrontId === 'kazka') return 'kazka';
  if (input.storefrontId === 'zareczyny') return 'zareczyny';
  if (isKazkaHeadlessChannel(input.channel, input.storefrontId) || isKazkaCatalogBrand(input.brand)) {
    return 'kazka';
  }
  return input.brand;
}

export function isKazkaAssortment(input: {
  vendor?: string | null;
  tags?: readonly string[] | null;
}): boolean {
  if (normalizeToken(input.vendor) === KAZKA_ASSORTMENT_VENDOR) return true;
  return (input.tags ?? []).some((tag) => normalizeToken(tag) === KAZKA_ASSORTMENT_TAG);
}

export function appendKazkaAssortmentClause(query: string): string {
  const trimmed = query.trim();
  if (TAG_CLAUSE_RE.test(trimmed) || VENDOR_CLAUSE_RE.test(trimmed)) return trimmed;
  if (!trimmed) return KAZKA_ASSORTMENT_CLAUSE;
  return `${trimmed} AND ${KAZKA_ASSORTMENT_CLAUSE}`;
}

export function isKazkaFilteredCatalogTool(toolName: string): boolean {
  return (
    toolName === 'search_catalog' ||
    toolName === 'catalog_search' ||
    toolName === 'catalog_image_search' ||
    toolName === 'catalog_lookup' ||
    toolName === 'lookup_catalog' ||
    toolName === 'get_product'
  );
}

export function isKazkaCatalogSearchTool(toolName: string): boolean {
  return (
    toolName === 'search_catalog' ||
    toolName === 'catalog_search' ||
    toolName === 'catalog_image_search'
  );
}

export async function enforceKazkaAssortmentOnCatalogResult(
  result: unknown,
  env: KazkaAssortmentEnv,
  options?: {maxProducts?: number},
): Promise<unknown> {
  return enforceAssortment(result, env, options, 'kazka');
}

/** EPIR nie dostaje produktu Kazka. Brak dowodu (vendor i tagi puste) zostawia produkt. */
export async function enforceEpirAssortmentOnCatalogResult(
  result: unknown,
  env: KazkaAssortmentEnv,
  options?: {maxProducts?: number},
): Promise<unknown> {
  return enforceAssortment(result, env, options, 'epir');
}

async function enforceAssortment(
  result: unknown,
  env: KazkaAssortmentEnv,
  options: {maxProducts?: number} | undefined,
  channel: 'kazka' | 'epir',
): Promise<unknown> {
  const bodies = collectCatalogBodies(result);
  const bag = emptyBag();
  for (const body of bodies) {
    visitProducts(body, (product) => {
      if (localDecision(product) === 'unknown') addRefs(product, bag);
    });
  }
  const membership = await loadMembership(env, bag);
  const totals: FilterStats = {kept: 0, dropped: 0};
  const rewritten = rewriteCatalogBodies(result, (body) => {
    const stats: FilterStats = {kept: 0, dropped: 0};
    const filtered = filterBody(body, membership, options?.maxProducts, stats, channel);
    totals.kept += stats.kept;
    totals.dropped += stats.dropped;
    return attachAssortmentNote(filtered, stats, channel);
  });
  if (totals.dropped > 0 || totals.kept > 0) {
    console.log(`[${channel}-assortment] filtered catalog result`, totals);
  }
  return rewritten;
}

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emptyBag(): RefBag {
  return {ids: [], handles: [], skus: []};
}

function readVendor(product: Record<string, unknown>): string | undefined {
  return typeof product.vendor === 'string' ? product.vendor : undefined;
}

function readProductTags(product: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(product.tags)) return undefined;
  return product.tags.filter((tag): tag is string => typeof tag === 'string');
}

function variantNodes(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants;
  if (Array.isArray(variants)) return variants.filter(isRecord);
  if (isRecord(variants) && Array.isArray(variants.nodes)) return variants.nodes.filter(isRecord);
  return [];
}

function variantHasKazkaTag(product: Record<string, unknown>): boolean {
  return variantNodes(product).some((variant) =>
    Array.isArray(variant.tags) &&
    variant.tags.some((tag) => normalizeToken(tag) === KAZKA_ASSORTMENT_TAG),
  );
}

function localDecision(product: Record<string, unknown>): 'keep' | 'drop' | 'unknown' {
  const vendor = readVendor(product);
  const tags = readProductTags(product);
  if (
    normalizeToken(vendor) === KAZKA_ASSORTMENT_VENDOR ||
    (tags ?? []).some((tag) => normalizeToken(tag) === KAZKA_ASSORTMENT_TAG) ||
    variantHasKazkaTag(product)
  ) {
    return 'keep';
  }
  if (vendor !== undefined && tags !== undefined) return 'drop';
  return 'unknown';
}

function isCatalogProduct(value: Record<string, unknown>): boolean {
  const id = firstString(value, ['id', 'product_id', 'gid']);
  if (id && (id.includes('/Product/') || id.includes('/ProductVariant/'))) return true;
  if (typeof value.sku === 'string' && value.sku.trim()) return true;
  if (Array.isArray(value.variants) || (isRecord(value.variants) && Array.isArray(value.variants.nodes))) {
    return true;
  }
  const url = firstString(value, ['url', 'onlineStoreUrl']);
  if (url?.includes('/products/')) return true;
  if (typeof value.handle === 'string' && (value.title || value.name)) return true;
  if (typeof value.vendor === 'string' || Array.isArray(value.tags)) return true;
  return false;
}

function hasProductContainer(value: Record<string, unknown>): boolean {
  for (const key of PRODUCT_ARRAY_KEYS) {
    if (Array.isArray(value[key])) return true;
  }
  for (const key of SINGLE_PRODUCT_KEYS) {
    if (isRecord(value[key])) return true;
  }
  return false;
}

function firstString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return undefined;
}

function extractIds(product: Record<string, unknown>): string[] {
  const ids = [
    firstString(product, ['id', 'product_id', 'gid', 'variant_id']),
    ...variantNodes(product).map((variant) => firstString(variant, ['id', 'variant_id', 'product_variant_id'])),
  ];
  return ids.filter((id): id is string => Boolean(id && GID_RE.test(id)));
}

function extractHandles(product: Record<string, unknown>): string[] {
  const handles: string[] = [];
  if (typeof product.handle === 'string') handles.push(product.handle);
  for (const url of [firstString(product, ['url', 'onlineStoreUrl'])]) {
    const handle = handleFromUrl(url);
    if (handle) handles.push(handle);
  }
  return handles.map((handle) => handle.trim()).filter(Boolean);
}

function extractSkus(product: Record<string, unknown>): string[] {
  const skus = [
    firstString(product, ['sku']),
    ...variantNodes(product).map((variant) => firstString(variant, ['sku'])),
  ];
  return skus.filter((sku): sku is string => Boolean(sku));
}

function handleFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'https://catalog.local');
    const match = parsed.pathname.match(/\/products\/([^/]+)/i);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function addRefs(product: Record<string, unknown>, bag: RefBag): void {
  bag.ids.push(...extractIds(product));
  bag.handles.push(...extractHandles(product));
  bag.skus.push(...extractSkus(product));
}

function refKeys(product: Record<string, unknown>): string[] {
  return [
    ...extractIds(product).map((id) => `id:${id}`),
    ...extractHandles(product).map((handle) => `handle:${handle.toLocaleLowerCase('en-US')}`),
    ...extractSkus(product).map((sku) => `sku:${sku.trim().toLocaleLowerCase('en-US')}`),
  ];
}

function keepProduct(product: Record<string, unknown>, membership: MembershipIndex): boolean {
  const decision = localDecision(product);
  if (decision === 'keep') return true;
  if (decision === 'drop') return false;
  const keys = refKeys(product);
  if (keys.length === 0) return false;
  return keys.some((key) => membership.get(key) === true);
}

function keepEpirProduct(product: Record<string, unknown>, membership: MembershipIndex): boolean {
  const decision = localDecision(product);
  if (decision === 'keep') return false;
  if (decision === 'drop') return true;
  const keys = refKeys(product);
  if (keys.some((key) => membership.get(key) === true)) return false;
  return true;
}

function keepForChannel(
  channel: 'kazka' | 'epir',
  product: Record<string, unknown>,
  membership: MembershipIndex,
): boolean {
  return channel === 'kazka' ? keepProduct(product, membership) : keepEpirProduct(product, membership);
}

function visitProducts(
  value: unknown,
  visitor: (product: Record<string, unknown>) => void,
  depth = 0,
): void {
  if (depth > 8 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) visitProducts(item, visitor, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  if (isCatalogProduct(value) && !hasProductContainer(value)) {
    visitor(value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PRODUCT_ARRAY_KEYS.has(key) && Array.isArray(child)) {
      for (const item of child) {
        if (isRecord(item) && isCatalogProduct(item)) visitor(item);
      }
      continue;
    }
    if (SINGLE_PRODUCT_KEYS.has(key) && isRecord(child) && isCatalogProduct(child)) {
      visitor(child);
      continue;
    }
    visitProducts(child, visitor, depth + 1);
  }
}

function filterBody(
  body: unknown,
  membership: MembershipIndex,
  maxProducts: number | undefined,
  stats: FilterStats,
  channel: 'kazka' | 'epir',
): unknown {
  if (isRecord(body) && isCatalogProduct(body) && !hasProductContainer(body)) {
    if (keepForChannel(channel, body, membership)) {
      stats.kept += 1;
      return body;
    }
    stats.dropped += 1;
    return {product: null};
  }
  return filterValue(body, membership, maxProducts, stats, channel, 0);
}

function filterValue(
  value: unknown,
  membership: MembershipIndex,
  maxProducts: number | undefined,
  stats: FilterStats,
  channel: 'kazka' | 'epir',
  depth: number,
): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => filterValue(item, membership, maxProducts, stats, channel, depth + 1));
  }
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (PRODUCT_ARRAY_KEYS.has(key) && Array.isArray(child)) {
      const kept: unknown[] = [];
      for (const item of child) {
        if (!isRecord(item) || !isCatalogProduct(item)) {
          kept.push(item);
          continue;
        }
        if (keepForChannel(channel, item, membership)) {
          kept.push(item);
          stats.kept += 1;
        } else {
          stats.dropped += 1;
        }
      }
      output[key] = typeof maxProducts === 'number' ? kept.slice(0, maxProducts) : kept;
      continue;
    }
    if (SINGLE_PRODUCT_KEYS.has(key) && isRecord(child) && isCatalogProduct(child)) {
      if (keepForChannel(channel, child, membership)) {
        output[key] = child;
        stats.kept += 1;
      } else {
        output[key] = null;
        stats.dropped += 1;
      }
      continue;
    }
    output[key] = filterValue(child, membership, maxProducts, stats, channel, depth + 1);
  }
  return output;
}

function attachAssortmentNote(body: unknown, stats: FilterStats, channel: 'kazka' | 'epir'): unknown {
  if (stats.dropped <= 0 || !isRecord(body)) return body;
  const note =
    channel === 'epir'
      ? stats.kept > 0
        ? 'Katalog EPIR: pominięto biżuterię z tagiem kazka lub vendor Kazka. Nie proponuj tych produktów.'
        : 'Brak produktów w katalogu EPIR dla tego zapytania. Nie proponuj biżuterii Kazka (tag kazka lub vendor Kazka).'
      : stats.kept > 0
        ? 'Katalog Kazka: w wyniku zostały tylko produkty z tagiem kazka lub vendor Kazka. Nie proponuj biżuterii spoza tego zbioru.'
        : 'Brak produktów w katalogu Kazka dla tego zapytania. Nie proponuj biżuterii spoza asortymentu Kazka (tag kazka lub vendor Kazka).';
  const previous = typeof body.system_note === 'string' ? body.system_note.trim() : '';
  return {
    ...body,
    system_note: previous ? `${previous} ${note}` : note,
  };
}

function collectCatalogBodies(result: unknown): unknown[] {
  const bodies: unknown[] = [];
  if (isRecord(result) && isRecord(result.structuredContent)) {
    bodies.push(result.structuredContent);
  }
  if (isRecord(result) && Array.isArray(result.content)) {
    let parsed = false;
    for (const entry of result.content) {
      if (!isRecord(entry) || typeof entry.text !== 'string') continue;
      const text = entry.text.trim();
      if (!text.startsWith('{') && !text.startsWith('[')) continue;
      try {
        bodies.push(JSON.parse(text));
        parsed = true;
      } catch {
        /* nie-JSON zostaje bez filtra strukturalnego */
      }
    }
    if (parsed || bodies.length > 0) return bodies;
  }
  if (bodies.length > 0) return bodies;
  bodies.push(result);
  return bodies;
}

function rewriteCatalogBodies(result: unknown, mapper: (body: unknown) => unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) return mapper(result);
  let parsed = false;
  const content = result.content.map((entry) => {
    if (!isRecord(entry) || typeof entry.text !== 'string') return entry;
    const text = entry.text.trim();
    if (!text.startsWith('{') && !text.startsWith('[')) return entry;
    try {
      const mapped = mapper(JSON.parse(text));
      parsed = true;
      return {...entry, text: JSON.stringify(mapped)};
    } catch {
      return entry;
    }
  });
  if (!parsed) return mapper(result);
  const next: Record<string, unknown> = {...result, content};
  if (isRecord(result.structuredContent)) {
    next.structuredContent = mapper(result.structuredContent);
  }
  return next;
}

const MEMBERSHIP_NODES_QUERY = `
  query KazkaAssortmentNodes($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Product {
        id
        handle
        vendor
        tags
      }
      ... on ProductVariant {
        id
        sku
        product {
          id
          handle
          vendor
          tags
        }
      }
    }
  }
`;

const MEMBERSHIP_SEARCH_QUERY = `
  query KazkaAssortmentSearch($search: String!) {
    products(first: 20, query: $search) {
      nodes {
        id
        handle
        vendor
        tags
        variants(first: 20) {
          nodes {
            id
            sku
          }
        }
      }
    }
  }
`;

async function loadMembership(env: KazkaAssortmentEnv, bag: RefBag): Promise<MembershipIndex> {
  const index: MembershipIndex = new Map();
  const ids = unique(bag.ids).slice(0, 50);
  const search = buildMembershipSearch(bag);
  if (ids.length === 0 && !search) return index;

  const shopDomain = env.SHOP_DOMAIN?.trim();
  const adminToken = env.SHOPIFY_ADMIN_TOKEN?.trim();
  const storefrontToken =
    env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim() || env.SHOPIFY_STOREFRONT_TOKEN?.trim();
  if (!shopDomain || (!adminToken && !storefrontToken)) {
    console.warn('[kazka-assortment] membership lookup skipped — missing shop or token; unverified products dropped');
    return index;
  }

  const endpoint = adminToken
    ? `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`
    : `https://${shopDomain}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const headers: Record<string, string> = adminToken
    ? {'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken}
    : {'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': storefrontToken!};

  const jobs: Array<Promise<void>> = [];
  if (ids.length > 0) {
    jobs.push(
      postGraphql(endpoint, headers, MEMBERSHIP_NODES_QUERY, {ids}).then((data) => {
        ingestNodes(data, index);
      }),
    );
  }
  if (search) {
    jobs.push(
      postGraphql(endpoint, headers, MEMBERSHIP_SEARCH_QUERY, {search}).then((data) => {
        ingestProducts(data, index);
      }),
    );
  }
  const settled = await Promise.allSettled(jobs);
  if (settled.every((item) => item.status === 'rejected')) {
    console.warn('[kazka-assortment] membership lookup failed; unverified products dropped');
  }
  return index;
}

function buildMembershipSearch(bag: RefBag): string {
  const parts = [
    ...unique(bag.handles)
      .slice(0, 15)
      .map((handle) => searchAtom('handle', handle))
      .filter((part): part is string => Boolean(part)),
    ...unique(bag.skus)
      .slice(0, 15)
      .map((sku) => searchAtom('sku', sku))
      .filter((part): part is string => Boolean(part)),
  ];
  return parts.join(' OR ');
}

function searchAtom(prefix: string, value: string): string | null {
  const cleaned = value.replace(/["\\]/g, '').trim();
  if (!cleaned) return null;
  return /[\s:]/.test(cleaned) ? `${prefix}:"${cleaned}"` : `${prefix}:${cleaned}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function postGraphql(
  endpoint: string,
  headers: Record<string, string>,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({query, variables}),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    throw new Error(`Kazka assortment GraphQL HTTP ${response.status}`);
  }
  const json = (await response.json()) as {data?: unknown; errors?: unknown};
  if (json.errors) {
    throw new Error('Kazka assortment GraphQL errors');
  }
  return json.data ?? null;
}

function rememberProduct(
  index: MembershipIndex,
  product: {id?: string | null; handle?: string | null; vendor?: string | null; tags?: string[] | null},
  variants?: Array<{id?: string | null; sku?: string | null}>,
): void {
  const kazka = isKazkaAssortment({vendor: product.vendor, tags: product.tags});
  if (product.id) index.set(`id:${product.id}`, kazka);
  if (product.handle) index.set(`handle:${product.handle.trim().toLocaleLowerCase('en-US')}`, kazka);
  for (const variant of variants ?? []) {
    if (variant.id) index.set(`id:${variant.id}`, kazka);
    if (variant.sku) index.set(`sku:${variant.sku.trim().toLocaleLowerCase('en-US')}`, kazka);
  }
}

function ingestNodes(data: unknown, index: MembershipIndex): void {
  if (!isRecord(data) || !Array.isArray(data.nodes)) return;
  for (const node of data.nodes) {
    if (!isRecord(node)) continue;
    if (node.__typename === 'ProductVariant' && isRecord(node.product)) {
      const product = node.product as {
        id?: string | null;
        handle?: string | null;
        vendor?: string | null;
        tags?: string[] | null;
      };
      rememberProduct(index, product, [
        {id: typeof node.id === 'string' ? node.id : null, sku: typeof node.sku === 'string' ? node.sku : null},
      ]);
      continue;
    }
    rememberProduct(index, {
      id: typeof node.id === 'string' ? node.id : null,
      handle: typeof node.handle === 'string' ? node.handle : null,
      vendor: typeof node.vendor === 'string' ? node.vendor : null,
      tags: Array.isArray(node.tags) ? node.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    });
  }
}

function ingestProducts(data: unknown, index: MembershipIndex): void {
  if (!isRecord(data) || !isRecord(data.products) || !Array.isArray(data.products.nodes)) return;
  for (const node of data.products.nodes) {
    if (!isRecord(node)) continue;
    const variants = isRecord(node.variants) && Array.isArray(node.variants.nodes)
      ? node.variants.nodes.filter(isRecord).map((variant) => ({
          id: typeof variant.id === 'string' ? variant.id : null,
          sku: typeof variant.sku === 'string' ? variant.sku : null,
        }))
      : [];
    rememberProduct(
      index,
      {
        id: typeof node.id === 'string' ? node.id : null,
        handle: typeof node.handle === 'string' ? node.handle : null,
        vendor: typeof node.vendor === 'string' ? node.vendor : null,
        tags: Array.isArray(node.tags) ? node.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      },
      variants,
    );
  }
}
