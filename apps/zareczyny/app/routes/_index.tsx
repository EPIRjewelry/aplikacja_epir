import {useEffect} from 'react';
import {Link, useLoaderData} from '@remix-run/react';
import {Image} from '@shopify/hydrogen';
import type {LoaderFunctionArgs} from '@remix-run/cloudflare';
import {
  RouteContent,
  ROUTE_CONTENT_QUERY,
  type RouteContentProps,
} from '@epir/ui';
import {
  filterCollectionsForNav,
  parseCollectionFilter,
} from '~/lib/collection-filters';
import {HeroWithCollectionTiles} from '~/components/HeroWithCollectionTiles';

export function meta() {
  return [
    {title: 'EPIR Art Jewellery – Pierścionki zaręczynowe'},
    {
      description:
        'Luksusowe pierścionki zaręczynowe i biżuteria EPIR Art Jewellery & Gemstone.',
    },
  ];
}

type FeaturedCollection = {
  id: string;
  title: string;
  handle: string;
  image?: {
    altText?: string | null;
    width?: number | null;
    height?: number | null;
    url: string;
  } | null;
};

type LoaderData = {
  route: RouteContentProps['route'];
  collections: {
    nodes: FeaturedCollection[];
  };
};

export async function loader({context}: LoaderFunctionArgs): Promise<LoaderData> {
  const allowedHandles = parseCollectionFilter(context.env.COLLECTION_FILTER);
  const hubHandle = context.env.COLLECTION_HUB_HANDLE;

  // Prefer explicit storefront-specific route handle.
  // Keep route-home as temporary alias for zero-downtime migration.
  const routeHandles = ['route-zareczyny-home', 'route-home'];

  const fetchRouteByHandle = (handle: string) =>
    context.storefront.query<{route: RouteContentProps['route']}>(
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
    context.storefront.query<{
      collections: {nodes: FeaturedCollection[]};
    }>(COLLECTIONS_QUERY),
  ]);

  const {route} = routeResult;
  const {collections} = collectionsResult;

  const nodes = filterCollectionsForNav({
    nodes: collections.nodes,
    allowedHandles,
    hideHubHandle: hubHandle ?? null,
  });

  return {
    route: route ?? null,
    collections: {...collections, nodes},
  };
}

export default function Index() {
  const {route, collections} = useLoaderData<typeof loader>();
  
  useEffect(() => {
    document.body.classList.add('home-page');
    return () => {
      document.body.classList.remove('home-page');
    };
  }, []);

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

  if (hasRouteSections) {
    return (
      <HeroWithCollectionTiles 
        hero={route as any} 
        collections={collections.nodes} 
      />
    );
  }

  return (
    <>
      {/* Hydrogen Analytics: page_view (home fallback layout); same as above — Provider handles page_viewed + consent. */}
      <FallbackView collections={collections} />
    </>
  );
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
