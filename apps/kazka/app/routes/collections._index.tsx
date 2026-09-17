import {redirect} from '@remix-run/cloudflare';
import type {LoaderFunctionArgs} from '@remix-run/cloudflare';

type CollectionsQueryData = {
  collections: {nodes: {handle: string}[]};
};

const COLLECTIONS_QUERY = `#graphql
  query FirstCollections {
    collections(first: 20) {
      nodes { handle }
    }
  }
`;

/**
 * /collections (bez handle) → przekierowanie do pierwszej dozwolonej kolekcji.
 * Zachowuje query string (np. ?kat=pierscionek z globalnego headera).
 */
export async function loader({context, request}: LoaderFunctionArgs) {
  const filter = context.env.COLLECTION_FILTER;
  const allowedHandles = filter
    ? filter.split(',').map((h) => h.trim()).filter(Boolean)
    : null;

  const {collections} = await context.storefront.query<CollectionsQueryData>(
    COLLECTIONS_QUERY,
  );

  const nodes = allowedHandles?.length
    ? collections.nodes.filter((c: {handle: string}) =>
        allowedHandles.includes(c.handle),
      )
    : collections.nodes;

  const firstHandle = nodes[0]?.handle ?? allowedHandles?.[0];
  const search = new URL(request.url).search;
  if (firstHandle) {
    return redirect(`/collections/${firstHandle}${search}`, 302);
  }
  return redirect(`/${search}`, 302);
}
