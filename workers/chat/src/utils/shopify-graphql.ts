/**
 * Shared Shopify GraphQL client utilities
 * Extracted from duplicated adminGraphql functions
 */

import { SHOPIFY_ADMIN_API_VERSION } from '../config/shopify-api-version';

export interface ShopifyEnv {
  SHOP_DOMAIN?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOPIFY_STOREFRONT_TOKEN?: string;
}

/**
 * Execute GraphQL query against Shopify Admin API
 * @param env Environment with SHOP_DOMAIN and SHOPIFY_ADMIN_TOKEN
 * @param query GraphQL query string
 * @param variables Optional query variables
 * @returns Parsed GraphQL data
 */
export async function adminGraphql<T = any>(
  env: ShopifyEnv,
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const shopDomain = env.SHOP_DOMAIN || process.env.SHOP_DOMAIN;
  const adminToken = env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!shopDomain) {
    throw new Error('SHOP_DOMAIN not configured in wrangler.toml [vars]');
  }
  if (!adminToken) {
    throw new Error('SHOPIFY_ADMIN_TOKEN not set (use: wrangler secret put SHOPIFY_ADMIN_TOKEN)');
  }

  const endpoint = `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '<no body>');
    throw new Error(`Shopify GraphQL ${response.status}: ${text}`);
  }

  const data = (await response.json().catch(() => ({}))) as any;
  if (data?.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data as T;
}
