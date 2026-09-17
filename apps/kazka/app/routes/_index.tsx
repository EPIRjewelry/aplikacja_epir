import {redirect, type LoaderFunctionArgs} from '@remix-run/cloudflare';

import {type MetaFunction, useLoaderData} from '@remix-run/react';

import {ROUTE_CONTENT_QUERY, type RouteContentProps} from '@epir/ui';

import {getSeoMeta} from '@shopify/hydrogen';

import {

  fetchCampaignMapping,

  hasUtmParams,

  resolveCampaignRedirect,

} from '~/lib/campaign-landing.server';

import {

  filterCollectionsForNav,

  parseCollectionFilter,

} from '~/lib/collection-filters';

import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';

import {KazkaEditorialCategoryTiles} from '~/components/KazkaEditorialCategoryTiles';
import {KazkaEditorialHero} from '~/components/KazkaEditorialHero';
import {KazkaEditorialLines} from '~/components/KazkaEditorialLines';
import {KazkaEditorialManifestoBridge} from '~/components/KazkaEditorialManifestoBridge';
import {KazkaCustomOrderBrief} from '~/components/KazkaCustomOrderBrief';
import {KazkaEditorialVideoSection} from '~/components/KazkaEditorialVideoSection';
import {KazkaFeaturedProducts} from '~/components/KazkaFeaturedProducts';
import {parseCmsFeaturedProductsSections} from '~/lib/kazka-cms-featured-products';
import {parseCmsHeroSlides} from '~/lib/kazka-cms-hero';

export const meta: MetaFunction<typeof loader> = ({data}) =>

  getSeoMeta({

    title: 'EPIR Art Jewellery — Kazka',

    description:

      'Biżuteria KAZKA tworzona w polskiej pracowni — diamenty selekcjonowane przez gemmologów, projektowanie 3D i ręczne rzemiosło złotnicze.',

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

  media?: {

    nodes: Array<{

      mediaContentType?: string | null;

      image?: {url?: string | null} | null;

      sources?: Array<{url?: string | null; mimeType?: string | null}> | null;

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



const ROUTE_HANDLE = 'route-kazka-home';

const KAZKA_HUB_COLLECTION_HANDLE = 'kazka';



export async function loader({

  context,

  request,

}: LoaderFunctionArgs): Promise<{

  route: RouteContentProps['route'];

  collections: {nodes: FeaturedCollection[]};

  products: {nodes: FeaturedProduct[]};

  canonicalUrl: string;

}> {

  if (hasUtmParams(request.url)) {

    const mapping = await fetchCampaignMapping(context.storefront);

    const redirectTo = resolveCampaignRedirect(request.url, mapping, {

      allowDefault: false,

    });

    if (redirectTo) {

      return redirect(redirectTo, 302);

    }

  }



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



export default function Index() {

  const {route, collections: _collections, products: _products} =
    useLoaderData<typeof loader>();

  const heroSlides = parseCmsHeroSlides(route);
  const featuredProductsSections = parseCmsFeaturedProductsSections(route);

  return (

    <div className="kazka-home flex w-full flex-col overflow-x-clip">

      <KazkaEditorialHero slides={heroSlides} />
      <KazkaEditorialLines />
      {featuredProductsSections.map((section) => (
        <KazkaFeaturedProducts key={section.id} {...section} />
      ))}
      <KazkaEditorialCategoryTiles />
      <KazkaEditorialManifestoBridge />
      <KazkaEditorialVideoSection />
      <KazkaCustomOrderBrief />

    </div>

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

        media(first: 20) {

          nodes {

            __typename

            mediaContentType

            ... on MediaImage {

              image { url }

            }

            ... on Video {

              sources { mimeType url format }

            }

          }

        }

      }

    }

  }

`;


