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
  id title sku availableForSale weight weightUnit
  price { amount currencyCode }
  compareAtPrice { amount currencyCode }
  selectedOptions { name value }
  image { url altText }
  metafields(identifiers: ${variantMetafieldIdentifiersGql()}) { namespace key value }
`;

type PageInfo = {hasNextPage?: boolean; endCursor?: string | null};

export type HydrationStats = {
  null_nodes: number;
  normalize_null: number;
  no_url: number;
  /** nodes(ids:) null — before/without successful id or handle fallback. */
  null_id?: number;
  id_fallback_ok?: number;
  handle_fallback_ok?: number;
};

export type FetchStorefrontLiveOptions = {
  clientRequest?: Request;
  /** Kanał rozmowy — URL produktu (np. GZ), niezależnie od migawki katalogu. */
  urlChannel?: BuyerChannelId;
  /** Gemma v2 (D3): błąd MCP → throw z executeCatalogMcpLiveSearch. */
  throwOnMcpError?: boolean;
  /** Gemma v2 browse (D1) — tylko gdy woła searchGemmaCatalog. */
  browseInStockAvailable?: boolean;
  /** Liczniki utraty węzłów przy hydracji (gemma.catalog.stage). */
  hydrationStats?: HydrationStats;
  /** UCP product handles keyed by Product GID — handle hydrate after id fallback fails. */
  productHandlesById?: Record<string, string>;
};

function resolveProductUrlContext(
  catalogChannel: BuyerChannelId,
  options?: FetchStorefrontLiveOptions,
): {urlTemplate: string | undefined; normalizeChannel: BuyerChannelId} {
  const urlChannel = options?.urlChannel ?? catalogChannel;
  const urlTemplate = urlTemplateForChannel(urlChannel);
  const normalizeChannel =
    urlTemplate && urlChannel !== catalogChannel ? urlChannel : catalogChannel;
  return {urlTemplate, normalizeChannel};
}

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

function resolveZareczynyChannelAuth(env: Env): StorefrontAuth | null {
  const privateToken = env.PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY?.trim();
  if (privateToken) return {token: privateToken, mode: 'private'};
  const publicToken = env.PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY?.trim();
  if (publicToken) return {token: publicToken, mode: 'public'};
  return null;
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

function zareczynyUrlTemplate(): string {
  return 'https://zareczyny.epirbizuteria.pl/products/{handle}';
}

function urlTemplateForChannel(channel: BuyerChannelId): string | undefined {
  if (channel === 'kazka-hydrogen') return kazkaUrlTemplate();
  if (channel === 'epir-zareczyny') return zareczynyUrlTemplate();
  return undefined;
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

async function storefrontGraphqlWithAuth(
  env: Env,
  auth: StorefrontAuth,
  query: string,
  variables: Record<string, unknown>,
  options?: FetchStorefrontLiveOptions,
): Promise<Record<string, unknown>> {
  const shop = env.SHOP_DOMAIN?.trim();
  if (!shop) throw new Error('SHOP_DOMAIN missing');

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

async function storefrontGraphql(
  env: Env,
  channel: BuyerChannelId,
  query: string,
  variables: Record<string, unknown>,
  options?: FetchStorefrontLiveOptions,
): Promise<Record<string, unknown>> {
  const auth = resolveAuth(env, channel);
  if (!auth) throw new Error('no_token');
  return storefrontGraphqlWithAuth(env, auth, query, variables, options);
}

/** Produkty widoczne w kanale Hydrogen Zaręczyny (token kanału, nie online-store). */
async function productIdsPublishedOnZareczynyChannel(
  env: Env,
  productIds: string[],
  options?: FetchStorefrontLiveOptions,
): Promise<Set<string>> {
  const auth = resolveZareczynyChannelAuth(env);
  const out = new Set<string>();
  if (!auth || !productIds.length) return out;
  const query = `
    query ZareczynyChannelProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        id
      }
    }
  `;
  try {
    const data = await storefrontGraphqlWithAuth(env, auth, query, {ids: productIds}, options);
    const nodes = data.nodes as Array<{id?: string} | null> | null;
    for (const node of nodes ?? []) {
      if (node && typeof node.id === 'string' && node.id.trim()) {
        out.add(node.id.trim());
      }
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        tag: 'facts.zareczyny_channel_publish_check_failed',
        count: productIds.length,
        reason: err instanceof Error ? err.message.slice(0, 80) : 'error',
      }),
    );
  }
  return out;
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

/** Fragment GraphQL Product — pola walidowane w storefront-product-query-contract.test.ts */
export const STOREFRONT_PRODUCT_NODE_FIELDS = `
  id handle title vendor productType isGiftCard descriptionHtml onlineStoreUrl
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

const PRODUCT_NODE_FIELDS = STOREFRONT_PRODUCT_NODE_FIELDS;

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

/** Fallback gdy `nodes(ids:)` zwraca null — pojedynczy `product(id:)` (Storefront API). */
async function fetchProductNodeById(
  env: Env,
  channel: BuyerChannelId,
  productId: string,
  options?: FetchStorefrontLiveOptions,
): Promise<Record<string, unknown> | null> {
  const query = `
    query ProductByIdLive($id: ID!) @inContext(country: PL, language: PL) {
      product(id: $id) {
        ${PRODUCT_NODE_FIELDS}
      }
    }
  `;
  try {
    const data = await storefrontGraphqlRetry(env, channel, query, {id: productId}, options);
    const raw = data.product as Record<string, unknown> | null;
    return raw && isRecord(raw) ? raw : null;
  } catch (err) {
    console.log(
      JSON.stringify({
        tag: 'facts.product_by_id_fallback_error',
        channel,
        reason: err instanceof Error ? err.message.slice(0, 120) : 'error',
      }),
    );
    return null;
  }
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
  const {urlTemplate, normalizeChannel} = resolveProductUrlContext(channel, options);
  const urlChannel = options?.urlChannel ?? channel;
  const zareczynyPublished =
    urlChannel === 'epir-zareczyny' && urlTemplate
      ? await productIdsPublishedOnZareczynyChannel(env, productIds, options)
      : null;
  const byId = new Map<string, ProductFacts>();

  for (let i = 0; i < productIds.length; i += PAGE_SIZE) {
    const batch = productIds.slice(i, i + PAGE_SIZE);
    const nodes = await fetchProductNodesBatch(env, channel, batch, options);
    for (let j = 0; j < batch.length; j++) {
      const requestedId = batch[j];
      let raw = nodes[j];
      if (!raw || !isRecord(raw)) {
        options?.hydrationStats &&
          (options.hydrationStats.null_id = (options.hydrationStats.null_id ?? 0) + 1);
        console.log(
          JSON.stringify({
            tag: 'facts.hydration.null_id',
            channel,
            product_id: requestedId,
          }),
        );
        const fallback = await fetchProductNodeById(env, channel, requestedId, options);
        if (fallback) {
          raw = fallback;
          options?.hydrationStats &&
            (options.hydrationStats.id_fallback_ok =
              (options.hydrationStats.id_fallback_ok ?? 0) + 1);
          console.log(
            JSON.stringify({
              tag: 'facts.hydration.id_fallback_ok',
              channel,
              product_id: requestedId,
            }),
          );
        } else {
          const handle = options?.productHandlesById?.[requestedId]?.trim();
          if (handle) {
            const byHandle = await fetchProductFactsByHandle(env, channel, handle, options);
            if (byHandle) {
              options?.hydrationStats &&
                (options.hydrationStats.handle_fallback_ok =
                  (options.hydrationStats.handle_fallback_ok ?? 0) + 1);
              console.log(
                JSON.stringify({
                  tag: 'facts.hydration.handle_fallback_ok',
                  channel,
                  product_id: requestedId,
                  handle,
                }),
              );
              byId.set(requestedId, byHandle);
              continue;
            }
          }
          options?.hydrationStats && (options.hydrationStats.null_nodes += 1);
          continue;
        }
      }
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

      const perProductUrlTemplate = zareczynyUrlForProduct(
        zareczynyPublished,
        productId,
        urlTemplate,
      );
      const hadStoreUrl =
        typeof raw.onlineStoreUrl === 'string' && raw.onlineStoreUrl.trim().length > 0;
      const handleForUrl =
        typeof raw.handle === 'string' && raw.handle.trim() ? raw.handle.trim() : '';
      const facts = normalizeProduct(merged, {
        channel: normalizeChannel,
        urlTemplate: perProductUrlTemplate,
        fetchedAt,
      });
      if (!facts) {
        if (options?.hydrationStats) {
          options.hydrationStats.normalize_null += 1;
          if (
            normalizeChannel === 'epir-online-store' &&
            !hadStoreUrl &&
            !handleForUrl
          ) {
            options.hydrationStats.no_url += 1;
          } else if (
            normalizeChannel === 'epir-online-store' &&
            !hadStoreUrl &&
            handleForUrl &&
            !perProductUrlTemplate
          ) {
            options.hydrationStats.no_url += 1;
          }
        }
        continue;
      }
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

function zareczynyUrlForProduct(
  published: Set<string> | null,
  productId: string,
  template: string | undefined,
): string | undefined {
  if (!template) return undefined;
  if (!published) return template;
  return published.has(productId) ? template : undefined;
}

async function productNodeToFacts(
  env: Env,
  channel: BuyerChannelId,
  raw: Record<string, unknown>,
  options?: FetchStorefrontLiveOptions,
): Promise<ProductFacts | null> {
  const fetchedAt = new Date().toISOString();
  const {urlTemplate, normalizeChannel} = resolveProductUrlContext(channel, options);
  const urlChannel = options?.urlChannel ?? channel;
  const productId = typeof raw.id === 'string' ? raw.id : '';
  if (!productId) return null;

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

  let publishedOnZareczyny: Set<string> | null = null;
  if (urlChannel === 'epir-zareczyny' && urlTemplate) {
    publishedOnZareczyny = await productIdsPublishedOnZareczynyChannel(env, [productId], options);
  }

  const facts = normalizeProduct(merged, {
    channel: normalizeChannel,
    urlTemplate: zareczynyUrlForProduct(publishedOnZareczyny, productId, urlTemplate),
    fetchedAt,
  });
  if (!facts) return null;
  enrichFactsFromMetafields(facts, productMeta.nodes, allVariants);
  return facts;
}

export async function fetchProductFactsByHandle(
  env: Env,
  channel: BuyerChannelId,
  handle: string,
  options?: FetchStorefrontLiveOptions,
): Promise<ProductFacts | null> {
  const h = handle.trim();
  if (!h || !hasStorefrontCatalogToken(env, channel)) return null;
  const query = `
    query ProductByHandleLive($handle: String!) @inContext(country: PL, language: PL) {
      product(handle: $handle) {
        ${PRODUCT_NODE_FIELDS}
      }
    }
  `;
  try {
    const data = await storefrontGraphqlRetry(env, channel, query, {handle: h}, options);
    const raw = data.product as Record<string, unknown> | null;
    if (!raw || !isRecord(raw)) {
      console.log(
        JSON.stringify({
          tag: 'facts.product_by_handle',
          channel,
          byHandle: false,
        }),
      );
      return null;
    }
    return await productNodeToFacts(env, channel, raw, options);
  } catch (err) {
    console.warn(
      JSON.stringify({
        tag: 'facts.product_by_handle_error',
        channel,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/**
 * ProductFacts (pełne rodzeństwo wariantów) dla GID ProductVariant z koszyka.
 * @see https://shopify.dev/docs/api/storefront/latest/objects/ProductVariant
 */
export async function fetchProductFactsForVariantIds(
  env: Env,
  channel: BuyerChannelId,
  variantIds: string[],
  options?: FetchStorefrontLiveOptions,
): Promise<ProductFacts[]> {
  if (!hasStorefrontCatalogToken(env, channel) || !variantIds.length) return [];
  const uniqueVids = [...new Set(variantIds.map((id) => id.trim()).filter(Boolean))];
  const productIds = new Set<string>();
  for (let i = 0; i < uniqueVids.length; i += PAGE_SIZE) {
    const batch = uniqueVids.slice(i, i + PAGE_SIZE);
    const query = `
      query VariantProductIds($ids: [ID!]!) @inContext(country: PL, language: PL) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            product { id }
          }
        }
      }
    `;
    try {
      const data = await storefrontGraphqlRetry(env, channel, query, {ids: batch}, options);
      const nodes = data.nodes as Array<Record<string, unknown> | null> | null;
      for (const node of nodes ?? []) {
        if (!node || typeof node !== 'object') continue;
        const product = node.product;
        if (product && typeof product === 'object') {
          const pid = (product as {id?: unknown}).id;
          if (typeof pid === 'string' && pid.includes('/Product/')) productIds.add(pid);
        }
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          tag: 'facts.variant_product_ids_error',
          channel,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  if (!productIds.size) return [];
  return fetchProductFactsLive(env, channel, [...productIds], options);
}
