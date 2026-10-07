/**
 * Pełne stronicowane pobranie katalogu GK (kazka-hydrogen) przez Storefront GraphQL.
 * Wyłącznie PUBLIC_STOREFRONT_API_TOKEN_KAZKA — bez fallbacku do Admin / innego tokenu.
 */
import type {Env} from '../config/bindings';
import {SHOPIFY_STOREFRONT_API_VERSION} from '../config/shopify-api-version';
import {STOREFRONT_METAFIELD_IDENTIFIERS} from './field-mapping';
import {normalizeProduct} from './normalize';
import type {ProductFacts} from './types';

export const KAZKA_PRODUCT_URL_TEMPLATE = 'https://kazka.epirbizuteria.pl/products/{handle}';

const PAGE_SIZE = 50;

type SfPage = {
  products?: {
    pageInfo?: {hasNextPage?: boolean; endCursor?: string | null};
    nodes?: unknown[];
  };
};

function metafieldIdentifiersGql(): string {
  const parts = STOREFRONT_METAFIELD_IDENTIFIERS.map(
    (m) => `{namespace: "${m.namespace}", key: "${m.key}"}`,
  );
  return `[${parts.join(', ')}]`;
}

function buildStorefrontProductsQuery(): string {
  const ids = metafieldIdentifiersGql();
  return `
    query CatalogSnapshotGk($cursor: String) {
      products(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          handle
          title
          vendor
          productType
          descriptionHtml
          featuredImage { url altText }
          collections(first: 25) {
            nodes { handle title }
          }
          options { name values }
          metafields(identifiers: ${ids}) {
            namespace
            key
            value
          }
          variants(first: 100) {
            nodes {
              id
              title
              sku
              availableForSale
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
              selectedOptions { name value }
              image { url altText }
            }
          }
        }
      }
    }
  `;
}

async function storefrontGraphql(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<SfPage> {
  const shop = env.SHOP_DOMAIN?.trim();
  const token = env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim();
  if (!shop) throw new Error('SHOP_DOMAIN missing');
  if (!token) throw new Error('PUBLIC_STOREFRONT_API_TOKEN_KAZKA missing');

  const endpoint = `https://${shop}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Storefront GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {data?: SfPage; errors?: unknown};
  if (json.errors) {
    throw new Error(`Storefront GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }
  return json.data ?? {};
}

/**
 * Pobiera i normalizuje produkty widoczne w kanale Storefront KAZKA.
 * URL tylko dla produktów zwróconych przez ten kanał (szablon handle).
 */
export async function fetchGkCatalogProducts(env: Env): Promise<ProductFacts[]> {
  if (!env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim()) {
    throw new Error('no_token');
  }

  const query = buildStorefrontProductsQuery();
  const out: ProductFacts[] = [];
  let cursor: string | null = null;
  let pages = 0;

  for (;;) {
    const data = await storefrontGraphql(env, query, {cursor});
    pages += 1;
    const nodes = data.products?.nodes ?? [];
    for (const raw of nodes) {
      const facts = normalizeProduct(raw, {
        channel: 'kazka',
        urlTemplate: KAZKA_PRODUCT_URL_TEMPLATE,
      });
      if (facts) out.push(facts);
    }
    const pageInfo = data.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
    if (pages > 500) {
      console.warn('[facts.fetch-gk] page safety stop at 500');
      break;
    }
  }

  console.log(
    JSON.stringify({tag: 'facts.fetch_gk', products: out.length, pages}),
  );
  return out;
}
