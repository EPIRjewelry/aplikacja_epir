import type { Env } from '../env';
import type { ShopifyOrderCreateInputPlan, ShopifyLineItemPlan } from './types';

/** Pin with chat Admin API era — local constant (no import from workers/chat). */
export const SHOPIFY_ADMIN_API_VERSION = '2026-10';

export type FetchFn = typeof fetch;

export interface ShopifyAdminClients {
  resolveVariantIdBySku(sku: string): Promise<string | null>;
  /**
   * Documented orders filter is `tag:` (Admin 2026-10). Custom-attribute query syntax is not in that filter list.
   * Match `inpsa_marketplace_order_id` on the returned nodes.
   */
  findOrderByMarketplaceId(marketplaceOrderId: string): Promise<string | null>;
  orderCreate(input: ShopifyOrderCreateInputPlan): Promise<{ orderGid: string }>;
}

function requireShopifyEnv(env: Env): { shopDomain: string; adminToken: string } {
  const shopDomain = env.SHOP_DOMAIN?.trim();
  const adminToken = env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!shopDomain) {
    throw new Error('SHOP_DOMAIN is required for Shopify Admin orderCreate');
  }
  if (!adminToken) {
    throw new Error('SHOPIFY_ADMIN_TOKEN is required for Shopify Admin orderCreate');
  }
  return { shopDomain, adminToken };
}

async function adminGraphql<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
  fetchFn: FetchFn,
): Promise<T> {
  const { shopDomain, adminToken } = requireShopifyEnv(env);
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Shopify Admin HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`Shopify Admin GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) {
    throw new Error('Shopify Admin GraphQL: empty data');
  }
  return json.data;
}

const VARIANT_BY_SKU_QUERY = `#graphql
  query VariantBySku($q: String!) {
    productVariants(first: 1, query: $q) {
      nodes {
        id
        sku
      }
    }
  }
`;

const ORDERS_BY_TAG_QUERY = `#graphql
  query OrdersByInpostTag($q: String!) {
    orders(first: 10, query: $q) {
      nodes {
        id
        customAttributes {
          key
          value
        }
      }
    }
  }
`;

const ORDER_CREATE_MUTATION = `#graphql
  mutation OrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function escapeSkuQuery(sku: string): string {
  return sku.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createShopifyAdminClient(env: Env, fetchFn: FetchFn = fetch): ShopifyAdminClients {
  return {
    async resolveVariantIdBySku(sku: string): Promise<string | null> {
      const data = await adminGraphql<{
        productVariants: { nodes: Array<{ id: string; sku: string | null }> };
      }>(env, VARIANT_BY_SKU_QUERY, { q: `sku:${escapeSkuQuery(sku)}` }, fetchFn);
      const node = data.productVariants.nodes[0];
      if (!node?.id) return null;
      if (node.sku && node.sku.trim() !== sku.trim()) return null;
      return node.id;
    },

    async findOrderByMarketplaceId(marketplaceOrderId: string): Promise<string | null> {
      const data = await adminGraphql<{
        orders: {
          nodes: Array<{ id: string; customAttributes: Array<{ key: string; value: string }> }>;
        };
      }>(env, ORDERS_BY_TAG_QUERY, { q: 'tag:inpost-vh' }, fetchFn);
      const match = data.orders.nodes.find((node) =>
        node.customAttributes?.some(
          (attr) => attr.key === 'inpsa_marketplace_order_id' && attr.value === marketplaceOrderId,
        ),
      );
      return match?.id ?? null;
    },

    async orderCreate(input: ShopifyOrderCreateInputPlan): Promise<{ orderGid: string }> {
      const lineItems = input.lineItems.map((li: ShopifyLineItemPlan) => {
        if (!li.variantId) {
          throw new Error(`orderCreate: missing variantId for sku=${li.sku}`);
        }
        if (typeof li.unitAmount !== 'number' || li.currency !== 'PLN') {
          throw new Error(`orderCreate: line ${li.sku} needs PLN unit price`);
        }
        return {
          variantId: li.variantId,
          quantity: li.quantity,
          priceSet: {
            shopMoney: { amount: li.unitAmount, currencyCode: 'PLN' },
          },
        };
      });

      const order: Record<string, unknown> = {
        currency: 'PLN',
        lineItems,
        tags: input.tags,
        note: input.note,
        customAttributes: input.customAttributes,
        financialStatus: input.financialStatus,
        sourceName: input.sourceName,
        transactions: [
          {
            kind: 'SALE',
            status: 'SUCCESS',
            amountSet: {
              shopMoney: {
                amount: input.transactionAmount ?? 0,
                currencyCode: 'PLN',
              },
            },
          },
        ],
      };
      if (input.shippingPrice) {
        if (input.shippingPrice.currency !== 'PLN') {
          throw new Error(`orderCreate: shipping currency ${input.shippingPrice.currency}`);
        }
        order.shippingLines = [
          {
            title: 'INPSA',
            priceSet: {
              shopMoney: { amount: input.shippingPrice.amount, currencyCode: 'PLN' },
            },
          },
        ];
      }
      if (input.email) order.email = input.email;
      if (input.phone) order.phone = input.phone;
      if (input.shippingAddress) {
        const a = input.shippingAddress;
        order.shippingAddress = {
          firstName: a.firstName,
          lastName: a.lastName,
          address1: a.address1,
          address2: a.address2,
          city: a.city,
          zip: a.zip,
          province: a.province,
          countryCode: a.countryCode,
          phone: a.phone,
        };
      }

      const data = await adminGraphql<{
        orderCreate: {
          order: { id: string } | null;
          userErrors: Array<{ field?: string[] | null; message: string }>;
        };
      }>(
        env,
        ORDER_CREATE_MUTATION,
        {
          order,
          options: {
            inventoryBehaviour: 'DECREMENT_OBEYING_POLICY',
            sendReceipt: false,
            sendFulfillmentReceipt: false,
          },
        },
        fetchFn,
      );

      if (data.orderCreate.userErrors?.length) {
        throw new Error(
          `orderCreate userErrors: ${data.orderCreate.userErrors.map((e) => e.message).join('; ')}`,
        );
      }
      const gid = data.orderCreate.order?.id;
      if (!gid) {
        throw new Error('orderCreate returned no order id');
      }
      return { orderGid: gid };
    },
  };
}
