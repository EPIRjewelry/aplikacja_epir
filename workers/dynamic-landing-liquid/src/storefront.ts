import {
  DEFAULT_STOREFRONT_API_VERSION,
  type Env,
} from './env';

export async function fetchStorefront<T>(
  env: Env,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | null> {
  const token = env.SHOPIFY_STOREFRONT_TOKEN?.trim();
  const domain = env.SHOPIFY_STOREFRONT_DOMAIN?.trim();
  if (!token || !domain) return null;

  const version =
    env.SHOPIFY_STOREFRONT_API_VERSION?.trim() || DEFAULT_STOREFRONT_API_VERSION;
  const url = `https://${domain}/api/${version}/graphql.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({query, variables}),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{message: string}>;
    };
    if (json.errors?.length || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}
