import {type MetaFunction, useLoaderData, useSearchParams} from '@remix-run/react';
import {getPaginationVariables, getSeoMeta} from '@shopify/hydrogen';
import {CollectionFilters, ProductGrid} from '@epir/ui';
import {json, redirect, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {KazkaCollectionNav} from '~/components/KazkaCollectionNav';
import {KazkaEmptyCollectionState} from '~/components/KazkaEmptyCollectionState';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';
import {
  METAL_FILTER_OPTIONS,
  PROBA_FILTER_OPTIONS,
  QUALITY_FILTER_OPTIONS,
  SHAPE_FILTER_OPTIONS,
  SORT_FILTER_OPTIONS,
  WEIGHT_FILTER_OPTIONS,
  collectionHasActiveFilters,
  parseCollectionProductFilters,
  parseCollectionSort,
} from '~/lib/collection-product-filters';
import {preferVariantOptionsForLinia} from '~/lib/kazka-collection-nav';
import {COLLECTION_QUERY} from '~/queries/collection';
import type {CollectionQueryData} from '~/types/collection';

type CollectionsQueryData = {
  collections: {nodes: {handle: string}[]};
};

const FIRST_COLLECTION_QUERY = `#graphql
  query FirstCollections {
    collections(first: 20) {
      nodes { handle }
    }
  }
`;

export async function loader({
  context,
  params,
  request,
}: LoaderFunctionArgs) {
  const {handle} = params;
  const searchParams = new URL(request.url).searchParams;
  const paginationVariables = getPaginationVariables(request, {pageBy: 24});
  const filters = parseCollectionProductFilters(searchParams);
  const {sortKey, reverse} = parseCollectionSort(searchParams);

  const {collection} = await context.storefront.query<CollectionQueryData>(
    COLLECTION_QUERY,
    {
      variables: {
        handle,
        filters,
        sortKey,
        reverse,
        ...paginationVariables,
      },
      cache: context.storefront.CacheShort(),
    },
  );
  if (!collection) {
    const filter = context.env.COLLECTION_FILTER;
    const allowedHandles = filter
      ? filter.split(',').map((h) => h.trim()).filter(Boolean)
      : null;
    const {collections} = await context.storefront.query<CollectionsQueryData>(
      FIRST_COLLECTION_QUERY,
    );
    const nodes = allowedHandles?.length
      ? collections.nodes.filter((c: {handle: string}) =>
          allowedHandles.includes(c.handle),
        )
      : collections.nodes;
    const firstHandle = nodes[0]?.handle ?? allowedHandles?.[0];
    if (firstHandle && firstHandle !== handle) {
      return redirect(`/collections/${firstHandle}`, 302);
    }
    return redirect('/', 302);
  }

  return json(
    {
      collection,
      canonicalUrl: canonicalUrlFromRequest(request, context.env),
      activeFilterCount: filters.length,
    },
    {
      headers: {
        'Cache-Control': context.storefront.generateCacheControlHeader({
          maxAge: 60,
          staleWhileRevalidate: 600,
        }),
      },
    },
  );
}

export const meta: MetaFunction<typeof loader> = ({data}) => {
  if (!data?.collection) {
    return [];
  }
  return getSeoMeta({
    title: data.collection.title ?? undefined,
    description: data.collection.description?.slice(0, 154) ?? undefined,
    url: data.canonicalUrl,
  });
};

export default function Collection() {
  const {collection, activeFilterCount} = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const hasProducts = Boolean(collection.products?.nodes?.length);
  const activeLinia = searchParams.get('linia') ?? '';
  const activeKat = searchParams.get('kat') ?? '';
  const hasLiniaFilter = Boolean(activeLinia);
  const hasKatFilter = Boolean(activeKat);
  const hasOtherFilters =
    collectionHasActiveFilters(searchParams) &&
    !hasLiniaFilter &&
    !hasKatFilter;
  const preferVariantOptions = preferVariantOptionsForLinia(activeLinia);

  return (
    <section className="mx-auto w-full max-w-7xl gap-8">
      <KazkaCollectionNav />

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

      <CollectionFilters
        metalOptions={METAL_FILTER_OPTIONS}
        probaOptions={PROBA_FILTER_OPTIONS}
        shapeOptions={SHAPE_FILTER_OPTIONS}
        weightOptions={WEIGHT_FILTER_OPTIONS}
        qualityOptions={QUALITY_FILTER_OPTIONS}
        typeOptions={[]}
        sortOptions={SORT_FILTER_OPTIONS}
      />

      <div className="fadeIn" style={{animationDelay: '100ms'}}>
        {hasProducts ? (
          <ProductGrid
            key={`${collection.handle}-${activeFilterCount}-${activeLinia}-${activeKat}`}
            connection={collection.products}
            preferVariantOptions={preferVariantOptions}
          />
        ) : (
          <KazkaEmptyCollectionState
            hasLiniaFilter={hasLiniaFilter}
            hasKatFilter={hasKatFilter}
            hasOtherFilters={hasOtherFilters}
          />
        )}
      </div>
    </section>
  );
}
