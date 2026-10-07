/**
 * Pełny eksport katalogu GE przez Admin Bulk Operations (JSONL).
 * Fallback: stronicowanie z kontrolą kosztu / THROTTLED.
 */
import type {Env} from '../config/bindings';
import {SHOPIFY_ADMIN_API_VERSION} from '../config/shopify-api-version';
import {normalizeProduct} from './normalize';
import type {ProductFacts} from './types';

const PAGE_SIZE = 10;
const MAX_COST = 900;
const BULK_POLL_MS = 2000;
const BULK_MAX_POLLS = 180;

export class AdminGraphqlCostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminGraphqlCostError';
  }
}

export class AdminGraphqlThrottledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminGraphqlThrottledError';
  }
}

type GraphqlJson = {
  data?: Record<string, unknown>;
  errors?: Array<{message?: string; extensions?: {code?: string}}>;
  extensions?: {cost?: {requestedQueryCost?: number; actualQueryCost?: number; throttleStatus?: unknown}};
};

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function adminGraphqlRaw(
  env: Env,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlJson> {
  const shop = env.SHOP_DOMAIN?.trim();
  const token = env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!shop) throw new Error('SHOP_DOMAIN missing');
  if (!token) throw new Error('SHOPIFY_ADMIN_TOKEN missing');

  const endpoint = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
  });
  const json = (await res.json().catch(() => ({}))) as GraphqlJson;
  const codes = (json.errors ?? []).map((e) => e.extensions?.code ?? e.message ?? '');
  if (codes.some((c) => String(c).includes('THROTTLED') || String(c).includes('Throttled'))) {
    throw new AdminGraphqlThrottledError(JSON.stringify(json.errors).slice(0, 300));
  }
  if (codes.some((c) => String(c).includes('MAX_COST_EXCEEDED') || String(c).includes('MAX_COST'))) {
    throw new AdminGraphqlCostError(JSON.stringify(json.errors).slice(0, 300));
  }
  if (!res.ok) {
    throw new Error(`Admin GraphQL HTTP ${res.status}`);
  }
  if (json.errors?.length) {
    throw new Error(`Admin GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }
  const requested = json.extensions?.cost?.requestedQueryCost;
  if (typeof requested === 'number' && requested > MAX_COST) {
    throw new AdminGraphqlCostError(`requestedQueryCost ${requested} > ${MAX_COST}`);
  }
  return json;
}

const BULK_QUERY = `
{
  products(query: "status:active") {
    edges {
      node {
        id
        handle
        title
        vendor
        productType
        descriptionHtml
        onlineStoreUrl
        featuredMedia { preview { image { url altText } } }
        collections { edges { node { handle title } } }
        options { name values }
        metafield(namespace: "custom", key: "gemstone_origin") { namespace key value }
        variants {
          edges {
            node {
              id
              title
              sku
              availableForSale
              price
              compareAtPrice
              selectedOptions { name value }
              image { url altText }
            }
          }
        }
      }
    }
  }
}
`;

function adaptBulkProduct(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {...node};
  if (isRecord(node.featuredMedia)) {
    const prev = (node.featuredMedia as {preview?: {image?: unknown}}).preview?.image;
    if (prev) out.featuredImage = prev;
  }
  if (node.metafield && isRecord(node.metafield)) {
    out.metafields = {nodes: [node.metafield]};
  }
  // Bulk nested connections arrive as separate JSONL lines — when already nested:
  if (isRecord(node.variants) && Array.isArray((node.variants as {edges?: unknown[]}).edges)) {
    out.variants = {
      nodes: ((node.variants as {edges: Array<{node?: unknown}>}).edges || [])
        .map((e) => e.node)
        .filter(isRecord)
        .map((v) => {
          const next = {...v};
          if (typeof next.price === 'string' || typeof next.price === 'number') {
            next.price = {amount: String(next.price), currencyCode: 'PLN'};
          }
          return next;
        }),
    };
  }
  if (isRecord(node.collections) && Array.isArray((node.collections as {edges?: unknown[]}).edges)) {
    out.collections = {
      nodes: ((node.collections as {edges: Array<{node?: unknown}>}).edges || [])
        .map((e) => e.node)
        .filter(isRecord),
    };
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Parsuje JSONL z Bulk Operation: linie produktów + powiązane warianty/kolekcje po __parentId.
 */
export function parseBulkProductsJsonl(text: string): Record<string, unknown>[] {
  const products = new Map<string, Record<string, unknown>>();
  const variantsByParent = new Map<string, Record<string, unknown>[]>();
  const collectionsByParent = new Map<string, Record<string, unknown>[]>();

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = typeof row.id === 'string' ? row.id : '';
    const parentId = typeof row.__parentId === 'string' ? row.__parentId : '';
    if (id.includes('/Product/') && !parentId) {
      products.set(id, row);
      continue;
    }
    if (parentId && id.includes('/ProductVariant/')) {
      const list = variantsByParent.get(parentId) ?? [];
      list.push(row);
      variantsByParent.set(parentId, list);
      continue;
    }
    if (parentId && id.includes('/Collection/')) {
      const list = collectionsByParent.get(parentId) ?? [];
      list.push(row);
      collectionsByParent.set(parentId, list);
    }
  }

  const out: Record<string, unknown>[] = [];
  for (const [pid, product] of products) {
    const merged = {...product};
    const vars = variantsByParent.get(pid);
    if (vars) merged.variants = {nodes: vars};
    const cols = collectionsByParent.get(pid);
    if (cols) merged.collections = {nodes: cols};
    out.push(adaptBulkProduct(merged));
  }
  return out;
}

async function fetchViaBulk(env: Env): Promise<ProductFacts[]> {
  const run = await adminGraphqlRaw(
    env,
    `mutation { bulkOperationRunQuery(query: """${BULK_QUERY}""") {
      bulkOperation { id status }
      userErrors { field message }
    } }`,
  );
  const payload = run.data?.bulkOperationRunQuery as {
    bulkOperation?: {id?: string; status?: string};
    userErrors?: Array<{message?: string}>;
  };
  if (payload?.userErrors?.length) {
    throw new Error(`bulkOperationRunQuery: ${payload.userErrors.map((e) => e.message).join('; ')}`);
  }
  const opId = payload?.bulkOperation?.id;
  if (!opId) throw new Error('bulkOperationRunQuery: missing id');

  let url: string | null = null;
  for (let i = 0; i < BULK_MAX_POLLS; i++) {
    await sleep(BULK_POLL_MS);
    const poll = await adminGraphqlRaw(
      env,
      `query ($id: ID!) {
        node(id: $id) {
          ... on BulkOperation {
            id status errorCode objectCount url
          }
        }
      }`,
      {id: opId},
    );
    const node = poll.data?.node as {
      status?: string;
      errorCode?: string | null;
      url?: string | null;
    } | null;
    if (!node) continue;
    if (node.status === 'FAILED' || node.status === 'CANCELED') {
      throw new Error(`bulk failed: ${node.status} ${node.errorCode ?? ''}`);
    }
    if (node.status === 'COMPLETED') {
      url = node.url ?? null;
      break;
    }
  }
  if (!url) throw new Error('bulk operation timeout');

  const fileRes = await fetch(url);
  if (!fileRes.ok) throw new Error(`bulk JSONL HTTP ${fileRes.status}`);
  const text = await fileRes.text();
  const nodes = parseBulkProductsJsonl(text);
  const fetchedAt = new Date().toISOString();
  const out: ProductFacts[] = [];
  for (const raw of nodes) {
    const facts = normalizeProduct(raw, {channel: 'epir-online-store', fetchedAt});
    if (facts) out.push(facts);
  }
  console.log(JSON.stringify({tag: 'facts.fetch_ge_bulk', products: out.length, bytes: text.length}));
  return out;
}

const VARIANT_PAGE = 100;
const COLLECTIONS_PAGE = 50;
const ADMIN_VARIANT_FIELDS = `
  id title sku availableForSale price compareAtPrice
  selectedOptions { name value }
  image { url altText }
`;

async function adminGraphqlRetry(
  env: Env,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlJson> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await adminGraphqlRaw(env, query, variables);
    } catch (err) {
      if (err instanceof AdminGraphqlThrottledError || err instanceof AdminGraphqlCostError) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new AdminGraphqlThrottledError('exhausted throttle retries');
}

function wrapAdminVariantPrices(nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return nodes.map((v) => {
    const next = {...v};
    if (typeof next.price === 'string' || typeof next.price === 'number') {
      next.price = {amount: String(next.price), currencyCode: 'PLN'};
    }
    return next;
  });
}

type AdminPageInfo = {hasNextPage?: boolean; endCursor?: string | null};

async function loadAllAdminVariants(
  env: Env,
  productId: string,
  firstPage: {
    pageInfo?: AdminPageInfo;
    nodes?: Array<Record<string, unknown>>;
  },
): Promise<Array<Record<string, unknown>>> {
  const nodes = [...(firstPage.nodes ?? [])];
  let cursor = firstPage.pageInfo?.hasNextPage ? firstPage.pageInfo.endCursor ?? null : null;
  const query = `
    query ProductVariantsGe($id: ID!, $cursor: String) {
      product(id: $id) {
        variants(first: ${VARIANT_PAGE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { ${ADMIN_VARIANT_FIELDS} }
        }
      }
    }
  `;
  while (cursor) {
    const json = await adminGraphqlRetry(env, query, {id: productId, cursor});
    const product = json.data?.product as {
      variants?: {
        pageInfo?: AdminPageInfo;
        nodes?: Array<Record<string, unknown>>;
      };
    } | null;
    const page = product?.variants;
    nodes.push(...(page?.nodes ?? []));
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    cursor = page.pageInfo.endCursor;
  }
  return wrapAdminVariantPrices(nodes);
}

async function loadAllAdminCollections(
  env: Env,
  productId: string,
  firstPage: {
    pageInfo?: AdminPageInfo;
    nodes?: Array<Record<string, unknown>>;
  },
): Promise<Array<Record<string, unknown>>> {
  const nodes = [...(firstPage.nodes ?? [])];
  let cursor = firstPage.pageInfo?.hasNextPage ? firstPage.pageInfo.endCursor ?? null : null;
  const query = `
    query ProductCollectionsGe($id: ID!, $cursor: String) {
      product(id: $id) {
        collections(first: ${COLLECTIONS_PAGE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { handle title }
        }
      }
    }
  `;
  while (cursor) {
    const json = await adminGraphqlRetry(env, query, {id: productId, cursor});
    const product = json.data?.product as {
      collections?: {
        pageInfo?: AdminPageInfo;
        nodes?: Array<Record<string, unknown>>;
      };
    } | null;
    const page = product?.collections;
    nodes.push(...(page?.nodes ?? []));
    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    cursor = page.pageInfo.endCursor;
  }
  return nodes;
}

async function fetchViaPaged(env: Env): Promise<ProductFacts[]> {
  const query = `
    query CatalogSnapshotGe($cursor: String) {
      products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes {
          id handle title vendor productType descriptionHtml onlineStoreUrl
          featuredMedia { preview { image { url altText } } }
          collections(first: ${COLLECTIONS_PAGE}) {
            pageInfo { hasNextPage endCursor }
            nodes { handle title }
          }
          options { name values }
          metafield(namespace: "custom", key: "gemstone_origin") { namespace key value }
          variants(first: 25) {
            pageInfo { hasNextPage endCursor }
            nodes { ${ADMIN_VARIANT_FIELDS} }
          }
        }
      }
    }
  `;
  const out: ProductFacts[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const fetchedAt = new Date().toISOString();

  for (;;) {
    const json = await adminGraphqlRetry(env, query, {cursor});
    pages += 1;
    const products = json.data?.products as {
      pageInfo?: AdminPageInfo;
      nodes?: unknown[];
    };
    for (const raw of products?.nodes ?? []) {
      if (!isRecord(raw)) continue;
      const productId = typeof raw.id === 'string' ? raw.id : '';
      const variantsConn = raw.variants as {
        pageInfo?: AdminPageInfo;
        nodes?: Array<Record<string, unknown>>;
      } | undefined;
      const collectionsConn = raw.collections as {
        pageInfo?: AdminPageInfo;
        nodes?: Array<Record<string, unknown>>;
      } | undefined;
      const allVariants = productId
        ? await loadAllAdminVariants(env, productId, variantsConn ?? {})
        : wrapAdminVariantPrices(variantsConn?.nodes ?? []);
      const allCollections = productId
        ? await loadAllAdminCollections(env, productId, collectionsConn ?? {})
        : (collectionsConn?.nodes ?? []);
      const adapted = adaptBulkProduct({
        ...raw,
        variants: {nodes: allVariants},
        collections: {nodes: allCollections},
      });
      if (raw.metafield) adapted.metafields = {nodes: [raw.metafield]};
      const facts = normalizeProduct(adapted, {channel: 'epir-online-store', fetchedAt});
      if (facts) out.push(facts);
    }
    if (!products?.pageInfo?.hasNextPage || !products.pageInfo.endCursor) break;
    cursor = products.pageInfo.endCursor;
    if (pages > 2000) break;
  }
  console.log(JSON.stringify({tag: 'facts.fetch_ge_paged', products: out.length, pages}));
  return out;
}

export async function fetchGeCatalogProducts(env: Env): Promise<ProductFacts[]> {
  try {
    return await fetchViaBulk(env);
  } catch (err) {
    console.warn(
      JSON.stringify({
        tag: 'facts.fetch_ge_bulk_fallback',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    return fetchViaPaged(env);
  }
}
