import {Link, useLoaderData} from '@remix-run/react';
import {Image} from '@shopify/hydrogen';
import type {LoaderFunctionArgs} from '@remix-run/cloudflare';

export function meta() {
  return [
    {title: 'EPIR Art Jewellery – Pierścionki zaręczynowe'},
    {
      description:
        'Luksusowe pierścionki zaręczynowe i biżuteria EPIR Art Jewellery & Gemstone.',
    },
  ];
}

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
  collections: {
    nodes: FeaturedCollection[];
  };
  products: {
    nodes: FeaturedProduct[];
  };
};

export async function loader({context}: LoaderFunctionArgs): Promise<LoaderData> {
  const brand = context.env.BRAND ?? 'kazka';
  const filter = context.env.COLLECTION_FILTER;
  const allowedHandles = filter
    ? filter.split(',').map((h) => h.trim()).filter(Boolean)
    : null;

  const [collectionsResult, productsResult] = await Promise.all([
    context.storefront.query<{
      collections: {nodes: FeaturedCollection[]};
    }>(COLLECTIONS_QUERY),
    context.storefront.query<{
      products: {nodes: FeaturedProduct[]};
    }>(PRODUCTS_QUERY),
  ]);

  const {collections} = collectionsResult;
  const {products} = productsResult;

  const collectionNodes = allowedHandles?.length
    ? collections.nodes.filter((c: {handle: string}) =>
        allowedHandles.includes(c.handle),
      )
    : collections.nodes;

  return {
    collections: {...collections, nodes: collectionNodes},
    products,
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
                <Image
                  alt={product.images.nodes[0].altText || product.title}
                  data={product.images.nodes[0]}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 32em) 50vw, 25vw"
                  width={400}
                />
              )}
            </div>
            <h3 className="font-medium text-sm md:text-base text-[rgb(var(--color-primary))] group-hover:opacity-70 transition-opacity line-clamp-2 leading-tight">
              {product.title}
            </h3>
            <p className="text-xs md:text-sm text-[rgb(var(--color-primary))]/60 mt-1">
              {product.priceRange.minVariantPrice.amount}{' '}
              {product.priceRange.minVariantPrice.currencyCode}
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
                  {collection.image ? (
                    <Image
                      alt={collection.title}
                      data={collection.image}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 32em) 50vw, 33vw"
                      width={600}
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
  const {collections, products} = useLoaderData<typeof loader>();

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
