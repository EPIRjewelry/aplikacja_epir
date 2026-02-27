import {useLoaderData} from '@remix-run/react';
import {SeoHandleFunction} from '@shopify/hydrogen';
import {ProductGrid} from '@epir/ui';
import {json, redirect, LoaderArgs} from '@remix-run/cloudflare';

const FIRST_COLLECTION_QUERY = `#graphql
  query FirstCollections {
    collections(first: 20) {
      nodes { handle }
    }
  }
`;

export async function loader({context, params, request}: LoaderArgs) {
  const {handle} = params;
  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get('cursor');
  const {collection} = await context.storefront.query(COLLECTION_QUERY, {
    variables: {
      handle,
      cursor,
    },
  });
  if (!collection) {
    const filter = context.env.COLLECTION_FILTER;
    const allowedHandles = filter
      ? filter.split(',').map((h) => h.trim()).filter(Boolean)
      : null;
    const {collections} = await context.storefront.query<{
      collections: {nodes: {handle: string}[]};
    }>(FIRST_COLLECTION_QUERY);
    const nodes = allowedHandles?.length
      ? collections.nodes.filter((c) => allowedHandles.includes(c.handle))
      : collections.nodes;
    const firstHandle = nodes[0]?.handle ?? allowedHandles?.[0];
    if (firstHandle && firstHandle !== handle) {
      return redirect(`/collections/${firstHandle}`, 302);
    }
    return redirect('/', 302);
  }

  return json({
    collection,
  });
}

export default function Collection() {
  const {collection} = useLoaderData();

  return (
    <section className="w-full gap-8">
      <header className="grid w-full gap-6 py-6 md:py-8 fadeIn">
        <h1 className="text-3xl md:text-4xl font-bold text-[rgb(var(--color-primary))]">
          {collection.title}
        </h1>

        {collection.description && (
          <p className="max-w-2xl text-[rgb(var(--color-primary))]/70 whitespace-pre-wrap">
            {collection.description}
          </p>
        )}
      </header>

      <div className="fadeIn" style={{animationDelay: '100ms'}}>
        {collection.products?.nodes?.length ? (
          <ProductGrid
            products={collection.products.nodes}
            url={`/collections/${collection.handle}`}
            hasNextPage={collection.products.pageInfo.hasNextPage}
            endCursor={collection.products.pageInfo.endCursor}
          />
        ) : (
          <p className="text-[rgb(var(--color-primary))]/70 py-12">
            Brak produktów w tej kolekcji. Upewnij się, że produkty są
            opublikowane w kanale Pierścionki Zaręczynowe.
          </p>
        )}
      </div>
    </section>
  );
}

const COLLECTION_QUERY = `#graphql
  query CollectionDetails($handle: String!, $cursor: String) {
    collection(handle: $handle) {
      id
      title
      description
      handle
      products(first: 12, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          publishedAt
          handle
          variants(first: 1) {
            nodes {
              id
              image {
                url
                altText
                width
                height
              }
              price {
                amount
                currencyCode
              }
              compareAtPrice {
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

const seo: SeoHandleFunction<typeof loader> = ({data}) => ({
  title: data?.collection?.title,
  description: data?.collection?.description?.substr(0, 154) ?? undefined,
});
export const handle = {
  seo,
};
