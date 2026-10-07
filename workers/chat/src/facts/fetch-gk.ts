/**
 * Stronicowane pobranie katalogu GK (Storefront) — mała strona, kontrola błędów złożoności.
 * Wyłącznie PRIVATE_STOREFRONT_API_TOKEN_KAZKA (bez fallbacku na publiczny / GE).
 * Wszystkie warianty i kolekcje produktu (paginacja).
 */
import type {Env} from '../config/bindings';
import {SHOPIFY_STOREFRONT_API_VERSION} from '../config/shopify-api-version';
import {STOREFRONTS} from '../config/storefronts';
import {STOREFRONT_METAFIELD_IDENTIFIERS} from './field-mapping';
import {normalizeProduct} from './normalize';
import type {ProductFacts} from './types';

const PAGE_SIZE = 10;
const VARIANT_PAGE = 100;
const COLLECTIONS_PAGE = 50;

const VARIANT_FIELDS = `
  id title sku availableForSale
  price { amount currencyCode }
  compareAtPrice { amount currencyCode }
  selectedOptions { name value }
  image { url altText }
`;

type PageInfo = {hasNextPage?: boolean; endCursor?: string | null};

/** Opcje tur klienta — Buyer-IP z CF-Connecting-IP. Cron / refresh bez tego. */
export type FetchGkOptions = {
  clientRequest?: Request;
};

type GkEnv = Env & {PRIVATE_STOREFRONT_API_TOKEN_KAZKA?: string};

function privateKazkaToken(env: Env): string | undefined {
  return (env as GkEnv).PRIVATE_STOREFRONT_API_TOKEN_KAZKA?.trim();
}

function buyerIpFrom(options?: FetchGkOptions): string | undefined {
  const ip = options?.clientRequest?.headers?.get('CF-Connecting-IP')?.trim();
  return ip || undefined;
}

function metafieldIdentifiersGql(): string {
  const parts = STOREFRONT_METAFIELD_IDENTIFIERS.map(
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

async function storefrontGraphql(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
  options?: FetchGkOptions,
): Promise<Record<string, unknown>> {
  const shop = env.SHOP_DOMAIN?.trim();
  const token = privateKazkaToken(env);
  if (!shop) throw new Error('SHOP_DOMAIN missing');
  if (!token) throw new Error('no_token');

  const endpoint = `https://${shop}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Shopify-Storefront-Private-Token': token,
  };
  const buyerIp = buyerIpFrom(options);
  if (buyerIp) {
    headers['Shopify-Storefront-Buyer-IP'] = buyerIp;
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
  query: string,
  variables: Record<string, unknown>,
  options?: FetchGkOptions,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await storefrontGraphql(env, query, variables, options);
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
  productId: string,
  firstPage: {pageInfo?: PageInfo; nodes?: unknown[]},
  options?: FetchGkOptions,
): Promise<unknown[]> {
  const nodes = [...(firstPage.nodes ?? [])];
  let cursor = firstPage.pageInfo?.hasNextPage ? firstPage.pageInfo.endCursor ?? null : null;
  const query = `
    query ProductVariantsGk($id: ID!, $cursor: String) @inContext(country: PL, language: PL) {
      product(id: $id) {
        variants(first: ${VARIANT_PAGE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { ${VARIANT_FIELDS} }
        }
      }
    }
  `;
  while (cursor) {
    const data = await storefrontGraphqlRetry(env, query, {id: productId, cursor}, options);
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
  productId: string,
  firstPage: {pageInfo?: PageInfo; nodes?: unknown[]},
  options?: FetchGkOptions,
): Promise<unknown[]> {
  const nodes = [...(firstPage.nodes ?? [])];
  let cursor = firstPage.pageInfo?.hasNextPage ? firstPage.pageInfo.endCursor ?? null : null;
  const query = `
    query ProductCollectionsGk($id: ID!, $cursor: String) @inContext(country: PL, language: PL) {
      product(id: $id) {
        collections(first: ${COLLECTIONS_PAGE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { handle title }
        }
      }
    }
  `;
  while (cursor) {
    const data = await storefrontGraphqlRetry(env, query, {id: productId, cursor}, options);
    const product = data.product as {collections?: {pageInfo?: PageInfo; nodes?: unknown[]}} | null;
    const page = product?.collections;
    nodes.push(...(page?.nodes ?? []));
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    cursor = page.pageInfo.endCursor;
  }
  return nodes;
}

export async function fetchGkCatalogProducts(
  env: Env,
  options?: FetchGkOptions,
): Promise<ProductFacts[]> {
  if (!privateKazkaToken(env)) {
    throw new Error('no_token');
  }

  const ids = metafieldIdentifiersGql();
  const query = `
    query CatalogSnapshotGk($cursor: String) @inContext(country: PL, language: PL) {
      products(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id handle title vendor productType descriptionHtml
          featuredImage { url altText }
          collections(first: ${COLLECTIONS_PAGE}) {
            pageInfo { hasNextPage endCursor }
            nodes { handle title }
          }
          options { name values }
          metafields(identifiers: ${ids}) { namespace key value }
          variants(first: ${VARIANT_PAGE}) {
            pageInfo { hasNextPage endCursor }
            nodes { ${VARIANT_FIELDS} }
          }
        }
      }
    }
  `;

  const out: ProductFacts[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const fetchedAt = new Date().toISOString();
  const urlTemplate = kazkaUrlTemplate();

  for (;;) {
    const data = await storefrontGraphqlRetry(env, query, {cursor}, options);
    pages += 1;
    const products = data.products as {
      pageInfo?: PageInfo;
      nodes?: Array<Record<string, unknown>>;
    };
    for (const raw of products?.nodes ?? []) {
      const productId = typeof raw.id === 'string' ? raw.id : '';
      const variantsConn = raw.variants as {pageInfo?: PageInfo; nodes?: unknown[]} | undefined;
      const collectionsConn = raw.collections as {pageInfo?: PageInfo; nodes?: unknown[]} | undefined;
      const allVariants = productId
        ? await loadAllVariants(env, productId, variantsConn ?? {}, options)
        : (variantsConn?.nodes ?? []);
      const allCollections = productId
        ? await loadAllCollections(env, productId, collectionsConn ?? {}, options)
        : (collectionsConn?.nodes ?? []);
      const merged = {
        ...raw,
        variants: {nodes: allVariants},
        collections: {nodes: allCollections},
      };
      const facts = normalizeProduct(merged, {
        channel: 'kazka-hydrogen',
        urlTemplate,
        fetchedAt,
      });
      if (facts) out.push(facts);
    }
    const pageInfo = products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
    if (pages > 2000) break;
  }

  console.log(JSON.stringify({tag: 'facts.fetch_gk', products: out.length, pages}));
  return out;
}
