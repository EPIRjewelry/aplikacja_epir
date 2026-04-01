import {redirect} from '@remix-run/cloudflare';
import {LoaderArgs} from '@remix-run/cloudflare';

const COLLECTIONS_QUERY = `#graphql
  query FirstCollections {
    collections(first: 20) {
      nodes { handle }
    }
  }
`;

/**
 * /collections (bez handle) → przekierowanie do pierwszej dozwolonej kolekcji.
 * Naprawia 404 gdy Hero CTA ma cta_href="/collections".
 */
export async function loader({context}: LoaderArgs) {
  const filter = context.env.COLLECTION_FILTER;
  const allowedHandles = filter
    ? filter
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    : null;

  const {collections} = await context.storefront.query<{
    collections: {nodes: {handle: string}[]};
  }>(COLLECTIONS_QUERY);

  const nodes = allowedHandles?.length
    ? collections.nodes.filter((c) => allowedHandles.includes(c.handle))
    : collections.nodes;

  const firstHandle = nodes[0]?.handle ?? allowedHandles?.[0];
  if (firstHandle) {
    return redirect(`/collections/${firstHandle}`, 302);
  }
  return redirect('/', 302);
}
