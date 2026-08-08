import type { ShopifyConfig, ShopifyProduct } from './types.js';

function buildProductsQuery(config: ShopifyConfig): string {
  const vSize = config.variantsPageSize;
  const ns = config.variantMetafieldNamespace;
  return `
  query ProductsPage($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
          descriptionHtml
          onlineStoreUrl
          vendor
          productType
          tags
          featuredImage {
            url
          }
          collections(first: 15) {
            edges {
              node {
                title
              }
            }
          }
          metafields(first: 40) {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
          variants(first: ${vSize}) {
            edges {
              node {
                id
                sku
                price
                compareAtPrice
                availableForSale
                inventoryQuantity
                image {
                  url
                }
                inventoryItem {
                  unitCost {
                    amount
                  }
                }
                metafields(first: 12, namespace: "${ns}") {
                  edges {
                    node {
                      namespace
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;
}

type GraphQlResponse = {
  data?: {
    products?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{ node: Record<string, unknown> }>;
    };
  };
  errors?: Array<{ message: string }>;
};

function gidToNumericId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1] ?? gid;
}

function parseMetafields(
  edges:
    | Array<{ node: { namespace: string; key: string; value: string } }>
    | undefined,
  allowedKeys: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const edge of edges ?? []) {
    const key = `${edge.node.namespace}.${edge.node.key}`;
    if (!allowedKeys.length || allowedKeys.includes(key)) {
      out[key] = edge.node.value;
    }
  }
  return out;
}

function parseVariantMetafields(
  edges:
    | Array<{ node: { namespace: string; key: string; value: string } }>
    | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const edge of edges ?? []) {
    out[`${edge.node.namespace}.${edge.node.key}`] = edge.node.value;
  }
  return out;
}

function parseProduct(
  node: Record<string, unknown>,
  config: ShopifyConfig,
): ShopifyProduct {
  const collections =
    (
      node.collections as {
        edges?: Array<{ node: { title: string } }>;
      }
    )?.edges?.map((e) => e.node.title) ?? [];

  const metafieldEdges = (
    node.metafields as {
      edges?: Array<{ node: { namespace: string; key: string; value: string } }>;
    }
  )?.edges;

  const variantEdges =
    (
      node.variants as {
        edges?: Array<{ node: Record<string, unknown> }>;
      }
    )?.edges ?? [];

  const featuredImage = node.featuredImage as { url?: string } | null;

  return {
    id: gidToNumericId(String(node.id)),
    handle: String(node.handle ?? ''),
    title: String(node.title ?? ''),
    descriptionHtml: String(node.descriptionHtml ?? ''),
    onlineStoreUrl: (node.onlineStoreUrl as string | null) ?? null,
    featuredImageUrl: featuredImage?.url ?? null,
    vendor: String(node.vendor ?? config.brand),
    productType: String(node.productType ?? ''),
    tags: Array.isArray(node.tags) ? (node.tags as string[]) : [],
    collections,
    metafields: parseMetafields(metafieldEdges, config.metafieldKeys),
    variants: variantEdges.map((edge) => {
      const v = edge.node;
      const image = v.image as { url?: string } | null;
      const inventoryItem = v.inventoryItem as {
        unitCost?: { amount?: string };
      } | null;
      const variantMetaEdges = (
        v.metafields as {
          edges?: Array<{
            node: { namespace: string; key: string; value: string };
          }>;
        }
      )?.edges;

      return {
        id: gidToNumericId(String(v.id)),
        sku: (v.sku as string | null) ?? null,
        price: String(v.price ?? '0'),
        compareAtPrice: (v.compareAtPrice as string | null) ?? null,
        unitCost: inventoryItem?.unitCost?.amount ?? null,
        inventoryQuantity: Number(v.inventoryQuantity ?? 0),
        availableForSale: Boolean(v.availableForSale),
        imageUrl: image?.url ?? null,
        metafields: parseVariantMetafields(variantMetaEdges),
      };
    }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAllProducts(
  config: ShopifyConfig,
  token: string,
): Promise<ShopifyProduct[]> {
  const store = config.store.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const endpoint = `https://${store}/admin/api/${config.apiVersion}/graphql.json`;
  const products: ShopifyProduct[] = [];
  const query = buildProductsQuery(config);
  let after: string | null = null;
  let page = 0;

  for (;;) {
    page += 1;
    if (config.throttleMs > 0 && page > 1) {
      await sleep(config.throttleMs);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query,
        variables: {
          first: config.pageSize,
          after,
          query: config.productQuery,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify API HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as GraphQlResponse;
    if (payload.errors?.length) {
      throw new Error(
        `Shopify GraphQL: ${payload.errors.map((e) => e.message).join('; ')}`,
      );
    }

    const pageData = payload.data?.products;
    if (!pageData) break;

    for (const edge of pageData.edges) {
      products.push(parseProduct(edge.node, config));
    }

    if (!pageData.pageInfo.hasNextPage) break;
    after = pageData.pageInfo.endCursor;
  }

  return products;
}

export function buildProductUrl(
  product: ShopifyProduct,
  config: ShopifyConfig,
): string {
  if (product.onlineStoreUrl) return product.onlineStoreUrl;
  const base = config.storefrontBaseUrl.replace(/\/$/, '');
  return `${base}/products/${product.handle}`;
}
