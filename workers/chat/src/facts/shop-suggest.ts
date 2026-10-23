import type {BuyerChannelId} from '../buyer/channel-switch';
import {storefrontOriginForChannel} from '../buyer/channel-origins';

/**
 * Parse Shopify Ajax Predictive Search / suggest.json — exact product handles only.
 * @see https://shopify.dev/docs/api/ajax/reference/predictive-search
 */
export function extractHandlesFromSuggestJson(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as {
    resources?: {
      results?: {products?: unknown};
      products?: unknown;
    };
  };
  const products =
    (Array.isArray(root.resources?.results?.products) && root.resources.results.products) ||
    (Array.isArray(root.resources?.products) && root.resources.products) ||
    [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as {handle?: unknown; url?: unknown};
    let handle = typeof p.handle === 'string' ? p.handle.trim() : '';
    if (!handle && typeof p.url === 'string') {
      handle = handleFromProductPath(p.url);
    }
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

/** Exact handle from `/products/{handle}` path field — not title matching. */
export function handleFromProductPath(urlOrPath: string): string {
  const m = urlOrPath.trim().match(/\/products\/([^/?#]+)/i);
  if (!m?.[1]) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Live shop Ajax suggest — same host as storefront channel (epirbizuteria.pl etc.).
 * No hardcoded catalog handles.
 */
export async function fetchShopSuggestProductHandles(
  channel: BuyerChannelId,
  queryText: string,
  limit: number,
): Promise<string[]> {
  const q = queryText.trim();
  if (!q) return [];
  const capped = Math.max(1, Math.min(Math.trunc(limit) || 10, 10));
  const origin = storefrontOriginForChannel(channel);
  const url = new URL('/search/suggest.json', origin);
  url.searchParams.set('q', q);
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', String(capped));

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'epir-chat-worker/gemma-catalog-suggest',
      },
    });
    if (!res.ok) {
      console.log(
        JSON.stringify({
          tag: 'facts.shop_suggest',
          channel,
          ok: false,
          http_status: res.status,
        }),
      );
      return [];
    }
    const json: unknown = await res.json();
    const handles = extractHandlesFromSuggestJson(json);
    console.log(
      JSON.stringify({
        tag: 'facts.shop_suggest',
        channel,
        ok: true,
        query_preview: q.slice(0, 80),
        handle_count: handles.length,
        handles: handles.slice(0, 10),
      }),
    );
    return handles;
  } catch (err) {
    console.warn(
      JSON.stringify({
        tag: 'facts.shop_suggest_error',
        channel,
        reason: err instanceof Error ? err.message.slice(0, 120) : 'error',
      }),
    );
    return [];
  }
}
