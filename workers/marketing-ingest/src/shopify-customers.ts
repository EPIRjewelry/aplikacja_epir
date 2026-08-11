/**
 * Shopify Admin GraphQL — klienci do Customer Match (worker-side, bez eksportu PII do CLI).
 */
import type { ShopifyCustomerRow } from './customer-match-config';

export type ShopifyEnv = {
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOP?: string;
};

const CUSTOMERS_QUERY = `
  query CustomersPage($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          email
          firstName
          lastName
          tags
          numberOfOrders
          amountSpent {
            amount
          }
          emailMarketingConsent {
            marketingState
          }
        }
      }
    }
  }
`;

function shopHost(env: ShopifyEnv): string | null {
  const raw = (env.SHOP ?? '').trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//i, '').split('/')[0];
  if (host.includes('.')) return host;
  return `${host}.myshopify.com`;
}

function parseCustomerNode(node: Record<string, unknown>): ShopifyCustomerRow | null {
  const email = String(node.email ?? '').trim();
  if (!email) return null;
  const tagsRaw = node.tags;
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map((t) => String(t)) : [];
  const consent = node.emailMarketingConsent as { marketingState?: string } | undefined;
  const marketingState = String(consent?.marketingState ?? '').toUpperCase();
  const amountSpent = node.amountSpent as { amount?: string } | undefined;
  return {
    email,
    firstName: String(node.firstName ?? ''),
    lastName: String(node.lastName ?? ''),
    emailMarketingConsent: marketingState === 'SUBSCRIBED',
    totalSpent: Number.parseFloat(String(amountSpent?.amount ?? '0')) || 0,
    totalOrders: Number.parseInt(String(node.numberOfOrders ?? '0'), 10) || 0,
    tags,
  };
}

export async function fetchShopifyCustomers(
  env: ShopifyEnv,
): Promise<{ ok: true; customers: ShopifyCustomerRow[] } | { ok: false; error: string }> {
  const token = (env.SHOPIFY_ADMIN_TOKEN ?? '').trim();
  const host = shopHost(env);
  if (!token || !host) {
    return { ok: false, error: 'missing SHOPIFY_ADMIN_TOKEN or SHOP' };
  }

  const customers: ShopifyCustomerRow[] = [];
  let after: string | null = null;
  const url = `https://${host}/admin/api/2024-10/graphql.json`;

  for (let page = 0; page < 50; page++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: CUSTOMERS_QUERY,
        variables: { first: 250, after },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Shopify HTTP ${res.status}: ${text.slice(0, 600)}` };
    }
    let json: {
      data?: {
        customers?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          edges?: Array<{ node?: Record<string, unknown> }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      return { ok: false, error: `Shopify parse error: ${text.slice(0, 300)}` };
    }
    if (json.errors?.length) {
      return { ok: false, error: json.errors.map((e) => e.message).join('; ') };
    }
    const conn = json.data?.customers;
    for (const edge of conn?.edges ?? []) {
      const row = edge.node ? parseCustomerNode(edge.node) : null;
      if (row) customers.push(row);
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor ?? null;
    if (!after) break;
  }

  return { ok: true, customers };
}
