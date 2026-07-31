import {SHOPIFY_STOREFRONT_API_VERSION} from '../config/shopify-api-version';

export type KazkaCollectionNode = {
  id: string;
  handle: string;
  title: string;
  description?: string | null;
  updatedAt?: string | null;
};

export type KazkaProductNode = {
  id: string;
  handle: string;
  title: string;
  productType?: string | null;
  vendor?: string | null;
  tags?: string[];
  description?: string | null;
  descriptionHtml?: string | null;
  updatedAt?: string | null;
  options?: Array<{name: string; values: string[]}>;
  images?: {nodes: Array<{id?: string; url: string; altText?: string | null}>};
  variants?: {
    nodes: Array<{
      id: string;
      title: string;
      sku?: string | null;
      availableForSale: boolean;
      price?: {amount: string; currencyCode: string} | null;
    }>;
  };
};

const KAZKA_INGEST_COLLECTIONS_QUERY = `
  query KazkaIngestCollections($query: String!) {
    collections(first: 50, query: $query) {
      nodes {
        id
        handle
        title
        description
        updatedAt
      }
    }
  }
`;

const KAZKA_INGEST_COLLECTION_BY_HANDLE_QUERY = `
  query KazkaIngestCollectionByHandle($handle: String!) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      updatedAt
    }
  }
`;

const KAZKA_INGEST_PRODUCTS_QUERY = `
  query KazkaIngestProducts($collectionHandle: String!, $cursor: String) {
    collection(handle: $collectionHandle) {
      id
      handle
      title
      products(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          handle
          title
          productType
          vendor
          tags
          description
          descriptionHtml
          updatedAt
          options(first: 5) {
            name
            values
          }
          images(first: 5) {
            nodes {
              id
              altText
              url
            }
          }
          variants(first: 10) {
            nodes {
              id
              title
              sku
              availableForSale
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

async function callStorefront<T>(
  shopDomain: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${shopDomain}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
  });
  if (!response.ok) {
    throw new Error(`Storefront HTTP ${response.status}: ${await response.text()}`);
  }
  const json = (await response.json()) as {data?: T; errors?: Array<{message: string}>};
  if (json.errors?.length) {
    throw new Error(`Storefront GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) throw new Error('Storefront GraphQL: missing data');
  return json.data;
}

export async function fetchCollectionsByTag(
  shopDomain: string,
  token: string,
  tagQuery: string,
): Promise<KazkaCollectionNode[]> {
  const data = await callStorefront<{collections?: {nodes: KazkaCollectionNode[]}}>(
    shopDomain,
    token,
    KAZKA_INGEST_COLLECTIONS_QUERY,
    {query: tagQuery},
  );
  return data.collections?.nodes ?? [];
}

export async function fetchCollectionByHandle(
  shopDomain: string,
  token: string,
  handle: string,
): Promise<KazkaCollectionNode | null> {
  const data = await callStorefront<{collection?: KazkaCollectionNode | null}>(
    shopDomain,
    token,
    KAZKA_INGEST_COLLECTION_BY_HANDLE_QUERY,
    {handle},
  );
  return data.collection ?? null;
}

export async function fetchAllProductsInCollection(
  shopDomain: string,
  token: string,
  collectionHandle: string,
): Promise<KazkaProductNode[]> {
  const products: KazkaProductNode[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const data = await callStorefront<{
      collection?: {
        products?: {
          pageInfo: {hasNextPage: boolean; endCursor?: string | null};
          nodes: KazkaProductNode[];
        };
      } | null;
    }>(shopDomain, token, KAZKA_INGEST_PRODUCTS_QUERY, {
      collectionHandle,
      cursor,
    });

    const page = data.collection?.products;
    if (!page) break;
    products.push(...(page.nodes ?? []));
    hasNext = Boolean(page.pageInfo?.hasNextPage);
    cursor = page.pageInfo?.endCursor ?? null;
    if (hasNext && !cursor) break;
  }

  return products;
}
