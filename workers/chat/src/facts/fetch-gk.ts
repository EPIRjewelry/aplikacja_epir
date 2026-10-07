/**
 * Stronicowane pobranie katalogu GK (Storefront) — mała strona, kontrola błędów złożoności.
 * Wyłącznie PUBLIC_STOREFRONT_API_TOKEN_KAZKA.
 */
import type {Env} from '../config/bindings';
import {SHOPIFY_STOREFRONT_API_VERSION} from '../config/shopify-api-version';
import {STOREFRONTS} from '../config/storefronts';
import {STOREFRONT_METAFIELD_IDENTIFIERS} from './field-mapping';
import {normalizeProduct} from './normalize';
import type {ProductFacts} from './types';

const PAGE_SIZE = 10;

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
): Promise<SfPage> {
  const shop = env.SHOP_DOMAIN?.trim();
  const token = env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim();
  if (!shop) throw new Error('SHOP_DOMAIN missing');
  if (!token) throw new Error('no_token');

  const endpoint = `https://${shop}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: SfPage;
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

export async function fetchGkCatalogProducts(env: Env): Promise<ProductFacts[]> {
  if (!env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim()) {
    throw new Error('no_token');
  }

  const ids = metafieldIdentifiersGql();
  const query = `
    query CatalogSnapshotGk($cursor: String) {
      products(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id handle title vendor productType descriptionHtml
          featuredImage { url altText }
          collections(first: 5) { nodes { handle title } }
          options { name values }
          metafields(identifiers: ${ids}) { namespace key value }
          variants(first: 25) {
            nodes {
              id title sku availableForSale
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

  const out: ProductFacts[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const fetchedAt = new Date().toISOString();
  const urlTemplate = kazkaUrlTemplate();

  for (;;) {
    let data: SfPage | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        data = await storefrontGraphql(env, query, {cursor});
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('THROTTLED') || msg.includes('MAX_COST')) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    if (!data) throw new Error('Storefront throttle exhausted');
    pages += 1;
    for (const raw of data.products?.nodes ?? []) {
      const facts = normalizeProduct(raw, {
        channel: 'kazka-hydrogen',
        urlTemplate,
        fetchedAt,
      });
      if (facts) out.push(facts);
    }
    const pageInfo = data.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
    if (pages > 2000) break;
  }

  console.log(JSON.stringify({tag: 'facts.fetch_gk', products: out.length, pages}));
  return out;
}
