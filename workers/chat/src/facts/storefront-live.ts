/**
 * Storefront API na żywo — pojedyncze produkty po GID (nodes), bez migawek KV.
 */
import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {resolveStorefrontConfig} from '../config/storefronts';
import {SHOPIFY_STOREFRONT_API_VERSION} from '../config/shopify-api-version';
import {STOREFRONTS} from '../config/storefronts';
import {
  STOREFRONT_METAFIELD_IDENTIFIERS,
  VARIANT_METAFIELD_IDENTIFIERS,
} from './field-mapping';
import {normalizeProduct} from './normalize';
import type {ProductFacts} from './types';

const PAGE_SIZE = 10;
const VARIANT_PAGE = 100;
const COLLECTIONS_PAGE = 50;

const SIMPLE_PRODUCT_METAFIELD_IDS = STOREFRONT_METAFIELD_IDENTIFIERS.filter(
  (m) =>
    !(
      (m.namespace === 'shopify' && m.key === 'gemstone-type') ||
      (m.namespace === 'shopify' && m.key === 'jewelry-material') ||
      (m.namespace === 'custom' && m.key === 'stone_education')
    ),
);

function variantMetafieldIdentifiersGql(): string {
  const parts = VARIANT_METAFIELD_IDENTIFIERS.map(
    (m) => `{namespace: "${m.namespace}", key: "${m.key}"}`,
  );
  return `[${parts.join(', ')}]`;
}

const VARIANT_FIELDS = `
  id title sku availableForSale
  price { amount currencyCode }
  compareAtPrice { amount currencyCode }
  selectedOptions { name value }
  image { url altText }
  metafields(identifiers: ${variantMetafieldIdentifiersGql()}) { namespace key value }
`;

type PageInfo = {hasNextPage?: boolean; endCursor?: string | null};

export type FetchStorefrontLiveOptions = {
  clientRequest?: Request;
};

type TokenMode = 'private' | 'public';

type StorefrontAuth = {
  token: string;
  mode: TokenMode;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function buyerIpFrom(options?: FetchStorefrontLiveOptions): string | undefined {
  const ip = options?.clientRequest?.headers?.get('CF-Connecting-IP')?.trim();
  return ip || undefined;
}

function resolveAuth(env: Env, channel: BuyerChannelId): StorefrontAuth | null {
  if (channel === 'kazka-hydrogen') {
    const token = env.PRIVATE_STOREFRONT_API_TOKEN_KAZKA?.trim();
    if (!token) return null;
    return {token, mode: 'private'};
  }
  const cfg = resolveStorefrontConfig(env, 'online-store');
  const privateToken = cfg?.privateToken?.trim();
  if (privateToken) return {token: privateToken, mode: 'private'};
  const apiToken = cfg?.apiToken?.trim();
  if (apiToken) return {token: apiToken, mode: 'public'};
  return null;
}

/** Czy jest token Storefront dla kanału (bez rzucania). */
export function hasStorefrontCatalogToken(env: Env, channel: BuyerChannelId): boolean {
  return resolveAuth(env, channel) !== null;
}

function metafieldIdentifiersGql(): string {
  const parts = SIMPLE_PRODUCT_METAFIELD_IDS.map(
    (m) => `{namespace: "${m.namespace}", key: "${m.key}"}`,
  );
  return `[${parts.join(', ')}]`;
}

function kazkaUrlTemplate(): string {
  return (
    STOREFRONTS.kazka.productUrlTemplate ??
    'https://kazka.epirbizuteria.pl/products/{handle}'
  );
}

/** Nazwa kategorii (shopify.gemstone-type / jewelry-material): tylko name/title/label. */
function metaobjectCategoryName(node: unknown): string | null {
  if (!isRecord(node)) return null;
  const fields = (node.fields as unknown[]) ?? [];
  for (const f of fields) {
    if (!isRecord(f)) continue;
    const key = typeof f.key === 'string' ? f.key : '';
    const value = typeof f.value === 'string' ? f.value.trim() : '';
    if (!value || value.includes('gid://')) continue;
    if (key === 'name' || key === 'title' || key === 'label') return value;
  }
  return null;
}

/** stone_profile / stone_education: wszystkie niepuste pola tekstowe jako `klucz: wartość`. */
function metaobjectStoneEducationText(node: unknown): string | null {
  if (!isRecord(node)) return null;
  const fields = (node.fields as unknown[]) ?? [];
  const parts: string[] = [];
  for (const f of fields) {
    if (!isRecord(f)) continue;
    const key = typeof f.key === 'string' ? f.key.trim() : '';
    const value = typeof f.value === 'string' ? f.value.trim() : '';
    if (!key || !value || value.includes('gid://')) continue;
    parts.push(`${key}: ${value}`);
  }
  return parts.length ? parts.join('; ') : null;
}

function flattenMetaobjectReferences(
  references: unknown,
): string[] {
  if (!isRecord(references) || !Array.isArray(references.nodes)) return [];
  const out: string[] = [];
  for (const n of references.nodes) {
    const text = metaobjectCategoryName(n);
    if (text) out.push(text);
  }
  return out;
}

type MetafieldEntry = {namespace?: string; key?: string; value?: string};

/** Storefront 2026-10: `metafields(identifiers:)` → `[Metafield]!` (tablica z null); legacy `{nodes}` jako druga gałąź. */
function iterateMetafieldEntries(raw: unknown): MetafieldEntry[] {
  if (Array.isArray(raw)) {
    return raw.filter((m): m is MetafieldEntry => m != null && isRecord(m));
  }
  if (isRecord(raw) && Array.isArray(raw.nodes)) {
    return raw.nodes.filter((m): m is MetafieldEntry => m != null && isRecord(m));
  }
  return [];
}

function adaptProductMetafields(raw: Record<string, unknown>): {nodes: Array<{namespace: string; key: string; value: string}>} {
  const nodes: Array<{namespace: string; key: string; value: string}> = [];
  const push = (namespace: string, key: string, value: string | string[] | null | undefined) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      const filtered = value.filter((v) => v && !String(v).includes('gid://'));
      if (filtered.length) nodes.push({namespace, key, value: filtered.join(', ')});
      return;
    }
    const s = String(value).trim();
    if (!s || s.includes('gid://')) return;
    nodes.push({namespace, key, value: s});
  };

  for (const m of iterateMetafieldEntries(raw.metafields)) {
    if (!m.namespace || !m.key) continue;
    push(m.namespace, m.key, m.value);
  }

  const gemstoneType = raw._gemstoneTypeMeta as {references?: unknown} | undefined;
  const gemTexts = flattenMetaobjectReferences(gemstoneType?.references);
  if (gemTexts.length) push('shopify', 'gemstone-type', gemTexts);

  const jewelryMaterial = raw._jewelryMaterialMeta as {references?: unknown} | undefined;
  const matTexts = flattenMetaobjectReferences(jewelryMaterial?.references);
  if (matTexts.length) push('shopify', 'jewelry-material', matTexts);

  const stoneEd = raw._stoneEducationMeta as {reference?: unknown} | undefined;
  const edText = metaobjectStoneEducationText(stoneEd?.reference);
  if (edText) push('custom', 'stone_education', edText);

  return {nodes};
}

function readVariantMetafieldMap(variant: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of iterateMetafieldEntries(variant.metafields)) {
    if (!m.namespace || !m.key) continue;
    const value = typeof m.value === 'string' ? m.value.trim() : '';
    if (!value || value.includes('gid://')) continue;
    out[`${m.namespace}.${m.key}`] = value;
  }
  return out;
}

function enrichFactsFromMetafields(
  facts: ProductFacts,
  productNodes: Array<{namespace: string; key: string; value: string}>,
  variantNodes: unknown[],
): void {
  for (const m of productNodes) {
    const fullKey = `${m.namespace}.${m.key}`;
    facts.metafields[fullKey] = m.value;
    if (m.key === 'main_stone' && m.value) {
      if (!facts.stones.includes(m.value)) facts.stones.push(m.value);
    }
    if (m.key === 'metal' && m.value) {
      if (!facts.metals.includes(m.value)) facts.metals.push(m.value);
    }
  }
  const byVariantId = new Map<string, Record<string, string>>();
  for (const vn of variantNodes) {
    if (!isRecord(vn)) continue;
    const id = typeof vn.id === 'string' ? vn.id : '';
    if (!id) continue;
    byVariantId.set(id, readVariantMetafieldMap(vn));
  }
  for (const v of facts.variants) {
    const vm = byVariantId.get(v.variantId);
    if (vm && Object.keys(vm).length) v.variantMetafields = vm;
  }
}

async function storefrontGraphql(
  env: Env,
  channel: BuyerChannelId,
  query: string,
  variables: Record<string, unknown>,
  options?: FetchStorefrontLiveOptions,
): Promise<Record<string, unknown>> {
  const shop = env.SHOP_DOMAIN?.trim();
  const auth = resolveAuth(env, channel);
  if (!shop) throw new Error('SHOP_DOMAIN missing');
  if (!auth) throw new Error('no_token');

  const endpoint = `https://${shop}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth.mode === 'private') {
    headers['Shopify-Storefront-Private-Token'] = auth.token;
    const buyerIp = buyerIpFrom(options);
    if (buyerIp) headers['Shopify-Storefront-Buyer-IP'] = buyerIp;
  } else {
    headers['X-Shopify-Storefront-Access-Token'] = auth.token;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({query, variables}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    errors?: Array<{message?: string}>;
  };
  const msg = JSON.stringify(json.errors ?? []);
  if (msg.includes('THROTTLED') || msg.toLowerCase().includes('throttl')) {
    throw new Error('THROTTLED');
  }
  if (msg.toLowerCase().includes('max query cost') || msg.includes('MAX_COST')) {
    throw new Error('MAX_COST_EXCEEDED');
  }
  if (!res.ok) throw new Error(`Storefront GraphQL HTTP ${res.status}`);
  if (json.errors?.length) {
    throw new Error(`Storefront GraphQL errors: ${msg.slice(0, 400)}`);
  }
  return json.data ?? {};
}

async function storefrontGraphqlRetry(
  env: Env,
  channel: BuyerChannelId,
  query: string,
  variables: Record<string, unknown>,
  options?: FetchStorefrontLiveOptions,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await storefrontGraphql(env, channel, query, variables, options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('THROTTLED') || msg.includes('MAX_COST')) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Storefront throttle exhausted');
}

async function loadAllVariants(
  env: Env,
  channel: BuyerChannelId,
  productId: string,
  firstPage: {pageInfo?: PageInfo; nodes?: unknown[]},
  options?: FetchStorefrontLiveOptions,
): Promise<unknown[]> {
  const nodes = [...(firstPage.nodes ?? [])];
  let cursor = firstPage.pageInfo?.hasNextPage ? firstPage.pageInfo.endCursor ?? null : null;
  const query = `
    query ProductVariantsLive($id: ID!, $cursor: String) @inContext(country: PL, language: PL) {
      product(id: $id) {
        variants(first: ${VARIANT_PAGE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { ${VARIANT_FIELDS} }
        }
      }
    }
  `;
  while (cursor) {
    const data = await storefrontGraphqlRetry(env, channel, query, {id: productId, cursor}, options);
    const product = data.product as {variants?: {pageInfo?: PageInfo; nodes?: unknown[]}} | null;
    const page = product?.variants;
    nodes.push(...(page?.nodes ?? []));
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    cursor = page.pageInfo.endCursor;
  }
  return nodes;
}

async function loadAllCollections(
  env: Env,
  channel: BuyerChannelId,
  productId: string,
  firstPage: {pageInfo?: PageInfo; nodes?: unknown[]},
  options?: FetchStorefrontLiveOptions,
): Promise<unknown[]> {
  const nodes = [...(firstPage.nodes ?? [])];
  let cursor = firstPage.pageInfo?.hasNextPage ? firstPage.pageInfo.endCursor ?? null : null;
  const query = `
    query ProductCollectionsLive($id: ID!, $cursor: String) @inContext(country: PL, language: PL) {
      product(id: $id) {
        collections(first: ${COLLECTIONS_PAGE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { handle title }
        }
      }
    }
  `;
  while (cursor) {
    const data = await storefrontGraphqlRetry(env, channel, query, {id: productId, cursor}, options);
    const product = data.product as {collections?: {pageInfo?: PageInfo; nodes?: unknown[]}} | null;
    const page = product?.collections;
    nodes.push(...(page?.nodes ?? []));
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    cursor = page.pageInfo.endCursor;
  }
  return nodes;
}

const PRODUCT_NODE_FIELDS = `
  id handle title vendor productType descriptionHtml onlineStoreUrl
  featuredImage { url altText }
  collections(first: ${COLLECTIONS_PAGE}) {
    pageInfo { hasNextPage endCursor }
    nodes { handle title }
  }
  options { name values }
  metafields(identifiers: ${metafieldIdentifiersGql()}) { namespace key value }
  gemstoneTypeMeta: metafield(namespace: "shopify", key: "gemstone-type") {
    references(first: 20) {
      nodes { ... on Metaobject { type fields { key value } } }
    }
  }
  jewelryMaterialMeta: metafield(namespace: "shopify", key: "jewelry-material") {
    references(first: 20) {
      nodes { ... on Metaobject { type fields { key value } } }
    }
  }
  stoneEducationMeta: metafield(namespace: "custom", key: "stone_education") {
    reference { ... on Metaobject { type fields { key value } } }
  }
  variants(first: ${VARIANT_PAGE}) {
    pageInfo { hasNextPage endCursor }
    nodes { ${VARIANT_FIELDS} }
  }
`;

async function fetchProductNodesBatch(
  env: Env,
  channel: BuyerChannelId,
  ids: string[],
  options?: FetchStorefrontLiveOptions,
): Promise<Array<Record<string, unknown> | null>> {
  const query = `
    query ProductNodesLive($ids: [ID!]!) @inContext(country: PL, language: PL) {
      nodes(ids: $ids) {
        ... on Product {
          ${PRODUCT_NODE_FIELDS}
        }
      }
    }
  `;
  const data = await storefrontGraphqlRetry(env, channel, query, {ids}, options);
  const nodes = data.nodes as Array<Record<string, unknown> | null> | null;
  return nodes ?? [];
}

export async function fetchProductFactsLive(
  env: Env,
  channel: BuyerChannelId,
  productIds: string[],
  options?: FetchStorefrontLiveOptions,
): Promise<ProductFacts[]> {
  if (!hasStorefrontCatalogToken(env, channel)) {
    throw new Error('no_token');
  }
  if (!productIds.length) return [];

  const fetchedAt = new Date().toISOString();
  const urlTemplate = channel === 'kazka-hydrogen' ? kazkaUrlTemplate() : undefined;
  const byId = new Map<string, ProductFacts>();

  for (let i = 0; i < productIds.length; i += PAGE_SIZE) {
    const batch = productIds.slice(i, i + PAGE_SIZE);
    const nodes = await fetchProductNodesBatch(env, channel, batch, options);
    for (let j = 0; j < batch.length; j++) {
      const requestedId = batch[j];
      const raw = nodes[j];
      if (!raw || !isRecord(raw)) continue;
      const productId = typeof raw.id === 'string' ? raw.id : requestedId;

      const adaptedRaw = {
        ...raw,
        _gemstoneTypeMeta: raw.gemstoneTypeMeta,
        _jewelryMaterialMeta: raw.jewelryMaterialMeta,
        _stoneEducationMeta: raw.stoneEducationMeta,
      };
      const productMeta = adaptProductMetafields(adaptedRaw);

      const variantsConn = raw.variants as {pageInfo?: PageInfo; nodes?: unknown[]} | undefined;
      const collectionsConn = raw.collections as {pageInfo?: PageInfo; nodes?: unknown[]} | undefined;
      const allVariants = await loadAllVariants(env, channel, productId, variantsConn ?? {}, options);
      const allCollections = await loadAllCollections(
        env,
        channel,
        productId,
        collectionsConn ?? {},
        options,
      );

      const merged = {
        ...raw,
        metafields: productMeta,
        variants: {nodes: allVariants},
        collections: {nodes: allCollections},
      };
      delete (merged as Record<string, unknown>).gemstoneTypeMeta;
      delete (merged as Record<string, unknown>).jewelryMaterialMeta;
      delete (merged as Record<string, unknown>).stoneEducationMeta;

      const facts = normalizeProduct(merged, {
        channel,
        urlTemplate,
        fetchedAt,
      });
      if (!facts) continue;
      enrichFactsFromMetafields(facts, productMeta.nodes, allVariants);
      byId.set(requestedId, facts);
    }
  }

  const out: ProductFacts[] = [];
  for (const id of productIds) {
    const f = byId.get(id);
    if (f) out.push(f);
  }
  return out;
}
