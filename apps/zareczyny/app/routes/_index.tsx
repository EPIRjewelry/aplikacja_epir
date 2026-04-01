import {Link, useLoaderData} from '@remix-run/react';
import {MyCollection} from '~/models/collection';
import {CollectionConnection} from '@shopify/hydrogen/dist/storefront-api-types';
import {Image} from '@shopify/hydrogen';
import {LoaderArgs} from '@remix-run/cloudflare';
import {RouteContent, ROUTE_CONTENT_QUERY} from '@epir/ui';

export function meta() {
  return [
    {title: 'EPIR Art Jewellery – Pierścionki zaręczynowe'},
    {
      description:
        'Luksusowe pierścionki zaręczynowe i biżuteria EPIR Art Jewellery & Gemstone.',
    },
  ];
}

type RouteSectionField = {
  references?: {nodes?: unknown[]};
  nodes?: unknown[];
};

type LoaderData = {
  route: {
    id?: string;
    sections?: RouteSectionField;
    featured_collections?: RouteSectionField;
    featured_products?: RouteSectionField;
  } | null;
  collections: CollectionConnection;
};

export async function loader({context}: LoaderArgs): Promise<LoaderData> {
  const filter = context.env.COLLECTION_FILTER;
  const allowedHandles = filter
    ? filter
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    : null;

  // Prefer explicit storefront-specific route handle.
  // Keep route-home as temporary alias for zero-downtime migration.
  const routeHandles = ['route-zareczyny-home', 'route-home'];

  const fetchRouteByHandle = (handle: string) =>
    context.storefront.query<{route: LoaderData['route']}>(
      ROUTE_CONTENT_QUERY,
      {variables: {handle: {type: 'route', handle}}},
    );

  const [routeResult, collectionsResult] = await Promise.all([
    (async () => {
      for (const handle of routeHandles) {
        const result = await fetchRouteByHandle(handle);
        if (result.route) return result;
      }

      return {route: null};
    })(),
    context.storefront.query<{collections: CollectionConnection}>(
      COLLECTIONS_QUERY,
    ),
  ]);

  // Debug: raw result from Storefront for route content
  console.log('ROUTE_RESULT', JSON.stringify(routeResult, null, 2));

  const {route} = routeResult;
  const {collections} = collectionsResult;

  const nodes = allowedHandles?.length
    ? collections.nodes.filter((c: {handle: string}) =>
        allowedHandles.includes(c.handle),
      )
    : collections.nodes;

  return {
    route: route ?? null,
    collections: {...collections, nodes},
  };
}

function FallbackView({collections}: {collections: CollectionConnection}) {
  return (
    <section className="w-full gap-8 md:gap-12">
      <div className="text-center mb-8 md:mb-12 fadeIn">
        <h1 className="text-3xl md:text-4xl font-bold text-[rgb(var(--color-primary))] mb-4">
          Kolekcje pierścionków zaręczynowych
        </h1>
        <p className="text-[rgb(var(--color-primary))]/70 max-w-2xl mx-auto">
          Odkryj nasze wyjątkowe kolekcje biżuterii zaręczynowej.
        </p>
      </div>

      <div className="swimlane md:grid md:grid-flow-row md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:overflow-visible md:snap-none md:scroll-px-0 md:px-0">
        {collections.nodes.map((collection: MyCollection, i: number) => (
          <Link
            to={`/collections/${collection.handle}`}
            key={collection.id}
            className={`flex-shrink-0 w-[85vw] md:w-auto snap-center md:snap-align-none ${
              i > 0 ? 'fadeIn' : ''
            }`}
            style={i > 0 ? {animationDelay: `${i * 50}ms`} : undefined}
          >
            <div className="grid gap-4 group">
              <div className="card-image aspect-[4/5] md:aspect-square bg-gray-100 overflow-hidden">
                {collection?.image ? (
                  <Image
                    alt={`${collection.title}`}
                    data={collection.image}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 32em) 85vw, 33vw"
                    width={600}
                    loading={i < 3 ? 'eager' : 'lazy'}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    Brak zdjęcia
                  </div>
                )}
              </div>
              <h2 className="font-semibold text-[rgb(var(--color-primary))] group-hover:opacity-80 transition-opacity">
                {collection.title}
              </h2>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Index() {
  const {route, collections} = useLoaderData<LoaderData>();
  const heroCount =
    route?.sections?.references?.nodes?.length ??
    route?.sections?.nodes?.length ??
    0;
  const collectionsCount =
    route?.featured_collections?.references?.nodes?.length ??
    route?.featured_collections?.nodes?.length ??
    0;
  const productsCount =
    route?.featured_products?.references?.nodes?.length ??
    route?.featured_products?.nodes?.length ??
    0;
  const hasRouteSections =
    (heroCount > 0 || collectionsCount > 0 || productsCount > 0) && route;

  // Debug: what the component receives and how it computes counts
  console.log(
    'COMPONENT_ROUTE_DEBUG',
    JSON.stringify(
      {
        route: route
          ? {
              id: route.id,
              sections: route.sections,
              featured_collections: route.featured_collections,
              featured_products: route.featured_products,
            }
          : null,
        heroCount,
        collectionsCount,
        productsCount,
        hasRouteSections,
      },
      null,
      2,
    ),
  );

  if (hasRouteSections) {
    return (
      <section className="w-full gap-8 md:gap-12">
        <RouteContent route={route} />
      </section>
    );
  }

  return <FallbackView collections={collections} />;
}

const COLLECTIONS_QUERY = `#graphql
  query FeaturedCollections {
    collections(first: 20, query: "collection_type:smart") {
      nodes {
        id
        title
        handle
        image {
          altText
          width
          height
          url
        }
      }
    }
  }
`;
