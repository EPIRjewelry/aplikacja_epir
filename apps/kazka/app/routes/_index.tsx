import {Link, type MetaFunction, useLoaderData} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';
import type {LoaderFunctionArgs} from '@remix-run/cloudflare';
import {
  RouteContent,
  ROUTE_CONTENT_QUERY,
  ROUTE_SECTION_FIELD_KEYS,
  type RouteContentProps,
  type SectionField,
} from '@epir/ui';
import {
  filterCollectionsForNav,
  parseCollectionFilter,
} from '~/lib/collection-filters';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';

export const meta: MetaFunction<typeof loader> = ({data}) =>
  getSeoMeta({
    title: 'EPIR Art Jewellery — Kazka',
    description:
      'Biżuteria inspirowana naturą — kolekcja Kazka EPIR Art Jewellery & Gemstone.',
    url: data?.canonicalUrl,
  });

type FeaturedProduct = {
  id: string;
  title: string;
  handle: string;
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  images: {
    nodes: Array<{
      url: string;
      altText: string | null;
      width: number | null;
      height: number | null;
    }>;
  };
};

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
  products: {
    nodes: FeaturedProduct[];
  };
};

const ROUTE_HANDLE = 'route-kazka-home';

function sectionNodeCount(field: SectionField | undefined): number {
  return field?.references?.nodes?.length ?? field?.nodes?.length ?? 0;
}

function routeHasRenderableSections(
  route: RouteContentProps['route'],
): route is NonNullable<RouteContentProps['route']> {
  if (!route) return false;
  return ROUTE_SECTION_FIELD_KEYS.some(
    (key) => sectionNodeCount(route[key]) > 0,
  );
}

export async function loader({
  context,
  request,
}: LoaderFunctionArgs): Promise<LoaderData & {canonicalUrl: string}> {
  const allowedHandles = parseCollectionFilter(context.env.COLLECTION_FILTER);

  const [routeResult, collectionsResult, productsResult] = await Promise.all([
    context.storefront.query<{route: RouteContentProps['route']}>(
      ROUTE_CONTENT_QUERY,
      {variables: {handle: {type: 'route', handle: ROUTE_HANDLE}}},
    ),
    context.storefront.query<{
      collections: {nodes: FeaturedCollection[]};
    }>(COLLECTIONS_QUERY),
    context.storefront.query<{
      products: {nodes: FeaturedProduct[]};
    }>(PRODUCTS_QUERY),
  ]);

  const {route} = routeResult;
  const {collections} = collectionsResult;
  const {products} = productsResult;

  const collectionNodes = filterCollectionsForNav({
    nodes: collections.nodes,
    allowedHandles,
    hideHubHandle: null,
  });

  return {
    route: route ?? null,
    collections: {...collections, nodes: collectionNodes},
    products,
    canonicalUrl: canonicalUrlFromRequest(request, context.env),
  };
}

function ModelkaLayout({
  collections,
  products,
}: {
  collections: {nodes: FeaturedCollection[]};
  products: {nodes: FeaturedProduct[]};
}) {
  const modelkaImage = products.nodes[0]?.images?.nodes[0]?.url;
  const allProducts = products.nodes;

  return (
    <div className="w-full">
      <div className="relative w-full mb-12 md:mb-16">
        <div className="text-center mb-8 md:mb-12 fadeIn">
          <h1 className="text-3xl md:text-5xl font-bold text-[rgb(var(--color-primary))] mb-4 tracking-tight">
            EPIR Art Jewellery
          </h1>
          <p className="text-[rgb(var(--color-primary))]/70 max-w-2xl mx-auto text-sm md:text-base font-light">
            Pierścionki zaręczynowe i biżuteria inspirowana naturą
          </p>
        </div>

        {modelkaImage && (
          <div className="relative w-full h-[50vh] md:h-[70vh] overflow-hidden mb-8 md:mb-12">
            <img
              src={modelkaImage}
              alt="Modelka w biżuterii EPIR"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent opacity-60" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 px-2 md:px-0">
        {allProducts.slice(0, 8).map((product, i) => (
          <Link
            to={`/products/${product.handle}`}
            key={product.id}
            className="group fadeIn"
            style={{animationDelay: `${i * 80}ms`}}
          >
            <div className="aspect-square overflow-hidden bg-gray-50 mb-2 md:mb-3">
              {product.images.nodes[0] && (
                <img
                  src={product.images.nodes[0].url}
                  alt={product.images.nodes[0].altText || product.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  width={product.images.nodes[0].width ?? 400}
                  height={product.images.nodes[0].height ?? 400}
                  loading={i < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              )}
            </div>
            <h3 className="font-medium text-sm md:text-base text-[rgb(var(--color-primary))] group-hover:opacity-70 transition-opacity line-clamp-2 leading-tight">
              {product.title}
            </h3>
            <p className="text-xs md:text-sm text-[rgb(var(--color-primary))]/60 mt-1">
              {new Intl.NumberFormat('pl-PL', {
                style: 'currency',
                currency: product.priceRange.minVariantPrice.currencyCode,
                maximumFractionDigits: 0,
              }).format(Number(product.priceRange.minVariantPrice.amount))}
            </p>
          </Link>
        ))}
      </div>

      {collections.nodes.length > 0 && (
        <div className="mt-16 md:mt-24">
          <h2 className="text-2xl md:text-3xl font-bold text-[rgb(var(--color-primary))] mb-6 md:mb-8 text-center">
            Kolekcje
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {collections.nodes.map((collection, i) => (
              <Link
                to={`/collections/${collection.handle}`}
                key={collection.id}
                className="group fadeIn"
                style={{animationDelay: `${i * 100}ms`}}
              >
                <div className="aspect-[4/5] overflow-hidden bg-gray-100 mb-3">
                  {collection.image?.url ? (
                    <img
                      src={collection.image.url}
                      alt={collection.image.altText || collection.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      width={collection.image.width ?? 600}
                      height={collection.image.height ?? 750}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                </div>
                <h3 className="font-semibold text-lg text-[rgb(var(--color-primary))] group-hover:opacity-70 transition-opacity">
                  {collection.title}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Index() {
  const {route, collections, products} = useLoaderData<typeof loader>();

  if (routeHasRenderableSections(route)) {
    return <RouteContent route={route} />;
  }

  return <ModelkaLayout collections={collections} products={products} />;
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

const PRODUCTS_QUERY = `#graphql
  query FeaturedProducts {
    products(first: 12, query: "status:active") {
      nodes {
        id
        title
        handle
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        images(first: 1) {
          nodes {
            url
            altText
            width
            height
          }
        }
      }
    }
  }
`;
