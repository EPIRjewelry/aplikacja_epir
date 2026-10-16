import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {callStorefrontAPI} from '../../graphql';
import type {ProductMatch} from '../../facts/types';

/** Asortyment GZ — tag Shopify (decyzja operatora). */
export const ZARECZYNY_ASSORTMENT_TAG = 'zareczyny';

const TAGS_BATCH = 10;

const PRODUCT_TAGS_QUERY = `
  query GemmaProductTags($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        tags
      }
    }
  }
`;

type TagsNode = {id?: string; tags?: string[]} | null;

function resolveGzStorefrontToken(env: Env): string | null {
  const privateToken = env.PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY?.trim();
  if (privateToken) return privateToken;
  const publicToken = env.PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY?.trim();
  return publicToken || null;
}

function shopDomain(env: Env): string | null {
  const d = env.SHOP_DOMAIN?.trim();
  return d || null;
}

function hasTag(tags: string[] | undefined, tag: string): boolean {
  if (!tags?.length) return false;
  const want = tag.toLowerCase();
  return tags.some((t) => t.toLowerCase() === want);
}

function isAccessDeniedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ACCESS_DENIED/i.test(msg) || /access denied/i.test(msg);
}

async function fetchTaggedProductIds(
  env: Env,
  productIds: string[],
  clientRequest?: Request,
): Promise<Set<string> | null> {
  const domain = shopDomain(env);
  const token = resolveGzStorefrontToken(env);
  const tokenKind = env.PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY?.trim() ? 'private' : 'public';
  if (!domain || !token) {
    console.warn(
      JSON.stringify({
        tag: 'gemma.facts.assortment_tags_unavailable',
        reason: !domain ? 'no_shop_domain' : 'no_gz_token',
      }),
    );
    return null;
  }

  const buyerIp = clientRequest?.headers?.get('CF-Connecting-IP')?.trim();
  const allowed = new Set<string>();

  try {
    for (let i = 0; i < productIds.length; i += TAGS_BATCH) {
      const batch = productIds.slice(i, i + TAGS_BATCH);
      const data = await callStorefrontAPI<{nodes?: TagsNode[]}>(
        domain,
        token,
        PRODUCT_TAGS_QUERY,
        {ids: batch},
        {tokenKind, ...(buyerIp ? {buyerIp} : {})},
      );
      const nodes = data.nodes ?? [];
      for (const node of nodes) {
        if (!node?.id) continue;
        if (hasTag(node.tags, ZARECZYNY_ASSORTMENT_TAG)) {
          allowed.add(node.id);
        }
      }
    }
    return allowed;
  } catch (err) {
    console.warn(
      JSON.stringify({
        tag: 'gemma.facts.assortment_tags_failed',
        reason: err instanceof Error ? err.message.slice(0, 120) : 'error',
        access_denied: isAccessDeniedError(err),
      }),
    );
    return null;
  }
}

/**
 * Tylko `epir-zareczyny`. Brak tokenu / błąd / ACCESS_DENIED → 0 produktów (bez fallbacku na kolekcje).
 */
export async function filterProductMatchesByZareczynyTag(
  env: Env,
  channelId: BuyerChannelId,
  matches: ProductMatch[],
  clientRequest?: Request,
): Promise<ProductMatch[]> {
  if (channelId !== 'epir-zareczyny') return matches;
  if (!matches.length) return [];

  const ids = matches.map((m) => m.product.productId).filter(Boolean);
  const tagged = await fetchTaggedProductIds(env, ids, clientRequest);
  if (!tagged) return [];

  return matches.filter((m) => tagged.has(m.product.productId));
}
