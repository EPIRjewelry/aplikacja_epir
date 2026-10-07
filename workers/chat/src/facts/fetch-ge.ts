/**
 * Pełne stronicowane pobranie katalogu GE (epir-online-store) przez Admin GraphQL.
 * Do faktów trafiają tylko produkty ACTIVE z onlineStoreUrl != null.
 */
import type {Env} from '../config/bindings';
import {SHOPIFY_ADMIN_API_VERSION} from '../config/shopify-api-version';
import {STOREFRONT_METAFIELD_IDENTIFIERS} from './field-mapping';
import {normalizeProduct} from './normalize';
import type {ProductFacts} from './types';

const PAGE_SIZE = 50;

type AdminPage = {
  products?: {
    pageInfo?: {hasNextPage?: boolean; endCursor?: string | null};
    nodes?: unknown[];
  };
};

function adminMetafieldAliases(): string {
  return STOREFRONT_METAFIELD_IDENTIFIERS.map(
    (m, i) =>
      `mf${i}: metafield(namespace: "${m.namespace}", key: "${m.key}") { namespace key value }`,
  ).join('\n');
}

function buildAdminProductsQuery(): string {
  const mf = adminMetafieldAliases();
  return `
    query CatalogSnapshotGe($cursor: String) {
      products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          handle
          title
          vendor
          productType
          descriptionHtml
          onlineStoreUrl
          featuredMedia {
            preview { image { url altText } }
          }
          collections(first: 25) {
            nodes { handle title }
          }
          options { name values }
          ${mf}
          metafields(first: 20) {
            nodes { namespace key value }
          }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              availableForSale
              price
              compareAtPrice
              selectedOptions { name value }
              image { url altText }
              metafields(first: 10) {
                nodes { namespace key value }
              }
            }
          }
        }
      }
    }
  `;
}

function adaptAdminNode(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const node = {...(raw as Record<string, unknown>)};

  // featuredMedia → featuredImage for normalize
  const media = node.featuredMedia as {preview?: {image?: unknown}} | undefined;
  if (!node.featuredImage && media?.preview?.image) {
    node.featuredImage = media.preview.image;
  }

  // Collect aliased metafields into metafields.nodes
  const aliased: Array<{namespace: string; key: string; value: string}> = [];
  for (const [k, v] of Object.entries(node)) {
    if (!k.startsWith('mf') || !v || typeof v !== 'object') continue;
    const mf = v as {namespace?: string; key?: string; value?: string};
    if (mf.namespace && mf.key && typeof mf.value === 'string') {
      aliased.push({namespace: mf.namespace, key: mf.key, value: mf.value});
    }
    delete node[k];
  }
  if (aliased.length) {
    const existing = node.metafields as {nodes?: unknown[]} | undefined;
    const nodes = Array.isArray(existing?.nodes) ? [...existing.nodes] : [];
    for (const a of aliased) {
      if (!nodes.some((n) => (n as {key?: string}).key === a.key)) nodes.push(a);
    }
    node.metafields = {nodes};
  }

  // Admin variant.price is often a decimal string — wrap for normalize
  const variants = node.variants as {nodes?: Array<Record<string, unknown>>} | undefined;
  if (variants?.nodes) {
    node.variants = {
      nodes: variants.nodes.map((v) => {
        const next = {...v};
        if (typeof next.price === 'string' || typeof next.price === 'number') {
          next.price = {amount: String(next.price), currencyCode: 'PLN'};
        }
        if (typeof next.compareAtPrice === 'string' || typeof next.compareAtPrice === 'number') {
          next.compareAtPrice = {amount: String(next.compareAtPrice), currencyCode: 'PLN'};
        }
        return next;
      }),
    };
  }

  return node;
}

async function adminGraphql(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<AdminPage> {
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
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Admin GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {data?: AdminPage; errors?: unknown};
  if (json.errors) {
    throw new Error(`Admin GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }
  return json.data ?? {};
}

/**
 * Pobiera i normalizuje wszystkie aktywne produkty Online Store (GE).
 */
export async function fetchGeCatalogProducts(env: Env): Promise<ProductFacts[]> {
  const query = buildAdminProductsQuery();
  const out: ProductFacts[] = [];
  let cursor: string | null = null;
  let pages = 0;

  for (;;) {
    const data = await adminGraphql(env, query, {cursor});
    pages += 1;
    const nodes = data.products?.nodes ?? [];
    for (const raw of nodes) {
      const adapted = adaptAdminNode(raw);
      const facts = normalizeProduct(adapted, {channel: 'epir'});
      if (facts) out.push(facts);
    }
    const pageInfo = data.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
    if (pages > 500) {
      console.warn('[facts.fetch-ge] page safety stop at 500');
      break;
    }
  }

  console.log(
    JSON.stringify({tag: 'facts.fetch_ge', products: out.length, pages}),
  );
  return out;
}
