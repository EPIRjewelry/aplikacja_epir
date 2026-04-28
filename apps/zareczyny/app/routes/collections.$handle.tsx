import {Link, MetaFunction, useLoaderData} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';
import {
  CollectionEnhancedHero,
  type CollectionEnhancedFlat,
  ProductGrid,
} from '@epir/ui';
import {json, redirect, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {
  parseCollectionFilter,
  pickFirstAllowedCollectionHandle,
} from '~/lib/collection-filters';

type CollectionsQueryData = {
  collections: {nodes: {handle: string}[]};
};

type CollectionEnhancedFieldReference = {
  mediaContentType?: string | null;
  sources?: {url?: string | null; mimeType?: string | null}[] | null;
  image?: {url?: string | null; altText?: string | null} | null;
};

type CollectionEnhancedField = {
  key?: string | null;
  value?: string | null;
  reference?: CollectionEnhancedFieldReference | null;
  references?: {
    nodes?: Array<{
      image?: {url?: string | null} | null;
    } | null> | null;
  } | null;
};

type CollectionEnhancedMetaobject = {
  fields?: CollectionEnhancedField[] | null;
};

type MetalKind = 'gold' | 'silver';

type SubcollectionEntry = {
  handle: string;
  label: string;
  metal: MetalKind;
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Mapuje tablicę `fields` z metaobject (Storefront API) na płaski obiekt dla UI.
 */
export function mapCollectionEnhancedData(
  reference: CollectionEnhancedMetaobject | null | undefined,
): CollectionEnhancedFlat | null {
  const fields = reference?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return null;

  const out: CollectionEnhancedFlat = {
    name: null,
    philosophy: null,
    accentColor: null,
    heroVideoUrl: null,
    textureOverlayUrl: null,
    lookbookImages: [],
  };

  for (const field of fields) {
    switch (field.key) {
      case 'name':
        out.name = trimOrNull(field.value);
        break;
      case 'philosophy': {
        const raw = field.value;
        if (typeof raw !== 'string') break;
        const t = raw.trim();
        if (!t) break;
        try {
          const parsed = JSON.parse(t) as {type?: string};
          if (parsed?.type === 'root') {
            out.philosophy = JSON.stringify(parsed);
          } else {
            out.philosophy = t;
          }
        } catch {
          out.philosophy = t;
        }
        break;
      }
      case 'accent_color':
        out.accentColor = trimOrNull(field.value);
        break;
      case 'hero_video': {
        const sources = field.reference?.sources;
        const first =
          Array.isArray(sources) && sources.length > 0
            ? sources.find(
                (s) => typeof s?.url === 'string' && s.url.length > 0,
              )
            : undefined;
        out.heroVideoUrl = first?.url ?? null;
        break;
      }
      case 'texture_overlay': {
        const url = field.reference?.image?.url;
        out.textureOverlayUrl =
          typeof url === 'string' && url.length > 0 ? url : null;
        break;
      }
      case 'lookbook_images': {
        const nodes = field.references?.nodes;
        if (!Array.isArray(nodes)) break;
        const urls: string[] = [];
        for (const node of nodes) {
          const u = node?.image?.url;
          if (typeof u === 'string' && u.length > 0) urls.push(u);
        }
        out.lookbookImages = urls;
        break;
      }
      default:
        break;
    }
  }

  const empty =
    !out.name &&
    !out.philosophy &&
    !out.accentColor &&
    !out.heroVideoUrl &&
    !out.textureOverlayUrl &&
    out.lookbookImages.length === 0;

  return empty ? null : out;
}

function resolveHubHandle(env: {COLLECTION_HUB_HANDLE?: string}): string {
  return env.COLLECTION_HUB_HANDLE?.trim() || 'pierscionki-zareczynowe';
}

const DEFAULT_METAL_SUBCOLLECTIONS = [
  {suffix: 'zlote', label: 'Złote', metal: 'gold'},
  {suffix: 'srebrne', label: 'Srebrne', metal: 'silver'},
] as const;

type HubRoutingEnv = {
  COLLECTION_GOLD_HANDLE?: string;
  COLLECTION_SILVER_HANDLE?: string;
  COLLECTION_HUB_HANDLE?: string;
};

function resolveSubcollectionEntries(
  env: HubRoutingEnv,
  hubHandle: string,
): SubcollectionEntry[] {
  const goldHandle = env.COLLECTION_GOLD_HANDLE?.trim();
  const silverHandle = env.COLLECTION_SILVER_HANDLE?.trim();
  if (goldHandle || silverHandle) {
    return [
      {
        handle: goldHandle || `${hubHandle}-zlote`,
        label: 'Złote',
        metal: 'gold',
      },
      {
        handle: silverHandle || `${hubHandle}-srebrne`,
        label: 'Srebrne',
        metal: 'silver',
      },
    ];
  }
  return DEFAULT_METAL_SUBCOLLECTIONS.map(({suffix, label, metal}) => ({
    handle: `${hubHandle}-${suffix}`,
    label,
    metal,
  }));
}

function subMetaForHandle(
  subcollections: SubcollectionEntry[],
  collectionHandle: string,
): SubcollectionEntry | null {
  return subcollections.find((e) => e.handle === collectionHandle) ?? null;
}

/**
 * Działa też gdy w Cloudflare Pages brakuje COLLECTION_GOLD/SILVER — rozpoznaje podkolekcję
 * po typowych sufiksach w handle, niezależnie od tego, co jest w `wrangler.toml`.
 */
function inferSubcollectionFromHandle(
  collectionHandle: string,
  hubHandle: string,
  subcollections: SubcollectionEntry[],
): SubcollectionEntry | null {
  const fromEnv = subMetaForHandle(subcollections, collectionHandle);
  if (fromEnv) {
    return fromEnv;
  }
  const h = collectionHandle.toLowerCase();
  const hub = hubHandle.toLowerCase();
  if (h === `${hub}-zlote` || h.endsWith('-zlote')) {
    return {handle: collectionHandle, label: 'Złote', metal: 'gold'};
  }
  if (h === `${hub}-srebrne` || h.endsWith('-srebrne')) {
    return {handle: collectionHandle, label: 'Srebrne', metal: 'silver'};
  }
  return null;
}

/**
 * Jawne handly → wartość `product.metafield(namespace: "custom", key: "metal").value`
 * (np. "gold" / "silver"). Reszta: env + ten sam wzorzec co kafle hub (sufix / handle).
 */
const COLLECTION_METAL: Record<string, string> = {
  'zareczyny-zlote': 'gold',
  'zareczyny-srebrne': 'silver',
};

/**
 * W Shopify custom.metal może być "gold" / "Gold" / "złoto" — dopasowanie do złoto vs srebro.
 */
function productMetalMatchesFilter(
  raw: string | null | undefined,
  expected: 'gold' | 'silver',
): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return false;
  if (expected === 'gold') {
    return (
      v === 'gold' ||
      v === 'złoto' ||
      v === 'zloto' ||
      v === 'złote' ||
      v === 'zlote' ||
      v === 'yellow_gold' ||
      v === 'yellow gold'
    );
  }
  return (
    v === 'silver' ||
    v === 'srebro' ||
    v === 'srebrne' ||
    v === 'srebrna' ||
    v === 'srebrny' ||
    v === 'sterling' ||
    v === 'sterling_silver'
  );
}

function expectedMetalForHandle(
  collectionHandle: string,
  hubHandle: string,
  subcollections: SubcollectionEntry[],
): string | null {
  const fromMap = COLLECTION_METAL[collectionHandle];
  if (fromMap) {
    return fromMap;
  }
  return (
    inferSubcollectionFromHandle(
      collectionHandle,
      hubHandle,
      subcollections,
    )?.metal ?? null
  );
}

export async function loader({
  context,
  params,
  request,
}: LoaderFunctionArgs) {
  const {handle} = params;

  if (!handle) {
    throw new Response('Not Found', {status: 404});
  }

  const searchParams = new URL(request.url).searchParams;
  const hubHandle = resolveHubHandle(context.env);
  const subcollections = resolveSubcollectionEntries(context.env, hubHandle);
  const isHub = handle === hubHandle;
  const subMeta = !isHub
    ? inferSubcollectionFromHandle(handle, hubHandle, subcollections)
    : null;
  const expectedMetal = !isHub
    ? expectedMetalForHandle(handle, hubHandle, subcollections)
    : null;
  const missingSubcollectionHandle = isHub
    ? searchParams.get('missing')
    : null;
  const missingSubcollection = missingSubcollectionHandle
    ? inferSubcollectionFromHandle(
        missingSubcollectionHandle,
        hubHandle,
        subcollections,
      )
    : null;
  const cursor = isHub ? null : searchParams.get('cursor');
  const productFirst = isHub ? 0 : subMeta ? 48 : 12;
  const {collection} = await context.storefront.query(COLLECTION_QUERY, {
    variables: {
      handle,
      cursor,
      productFirst,
    },
  });

  if (!collection && isHub) {
    return json({
      collection: {
        id: `synthetic-${hubHandle}`,
        title: 'Pierścionki zaręczynowe',
        description: 'Wybierz pierścionki zaręczynowe według kruszcu.',
        handle: hubHandle,
        products: {
          nodes: [],
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
        },
      },
      enhancedData: null,
      hubMode: true,
      subcollectionLinks: subcollections,
      missingSubcollection: missingSubcollection ?? null,
      breadcrumb: null,
    });
  }

  if (!collection) {
    if (subMeta) {
      const missing = encodeURIComponent(handle);
      return redirect(`/collections/${hubHandle}?missing=${missing}`, 302);
    }
    const allowedHandles = parseCollectionFilter(context.env.COLLECTION_FILTER);
    const {collections} = await context.storefront.query<CollectionsQueryData>(`#graphql
      query FirstCollections {
        collections(first: 20) {
          nodes { handle }
        }
      }
      `);
    const nodes = allowedHandles?.length
        ? collections.nodes.filter((c: {handle: string}) =>
            allowedHandles.includes(c.handle),
          )
        : collections.nodes;
    const available = new Set(nodes.map((c) => c.handle));
    const firstHandle =
      pickFirstAllowedCollectionHandle({
        availableHandles: available,
        allowedHandles,
      }) ?? nodes[0]?.handle;
    if (firstHandle && firstHandle !== handle) {
      return redirect(`/collections/${firstHandle}`, 302);
    }
    return redirect('/', 302);
  }

  const enhancedData = mapCollectionEnhancedData(
    collection.metafield?.reference as
      | CollectionEnhancedMetaobject
      | null
      | undefined,
  );
  let displayCollection = collection;

  if (expectedMetal && collection.products?.nodes) {
    const metalKey = expectedMetal as 'gold' | 'silver';
    const filteredNodes = collection.products.nodes.filter(
      (p: {metal?: {value?: string | null} | null}) =>
        productMetalMatchesFilter(p.metal?.value, metalKey),
    );

    const products = {
      ...collection.products,
      nodes: filteredNodes,
      pageInfo: {
        ...collection.products.pageInfo,
        hasNextPage:
          filteredNodes.length > 0 && collection.products.pageInfo.hasNextPage,
      },
    };

    displayCollection = {
      ...collection,
      products,
    };
  }

  return json({
    collection: displayCollection,
    enhancedData,
    hubMode: isHub,
    subcollectionLinks: isHub ? subcollections : null,
    missingSubcollection: isHub ? missingSubcollection : null,
    breadcrumb: subMeta
      ? {
          parentHandle: hubHandle,
          parentLabel: 'Pierścionki zaręczynowe',
          currentLabel: subMeta.label,
        }
      : null,
  });
}

export default function Collection() {
  const {
    collection,
    enhancedData,
    hubMode,
    subcollectionLinks,
    breadcrumb,
    missingSubcollection,
  } = useLoaderData<typeof loader>();

  return (
    <section className="w-full gap-8">
      {breadcrumb ? (
        <nav
          className="text-sm text-[rgb(var(--color-primary))]/70 -mb-2 px-1"
          aria-label="Ścieżka nawigacji"
        >
          <Link
            to={`/collections/${breadcrumb.parentHandle}`}
            className="underline decoration-[rgb(var(--color-primary))]/30 hover:decoration-[rgb(var(--color-primary))]"
          >
            {breadcrumb.parentLabel}
          </Link>
          <span className="mx-2" aria-hidden>
            /
          </span>
          <span className="text-[rgb(var(--color-primary))]">
            {breadcrumb.currentLabel}
          </span>
        </nav>
      ) : null}
      <CollectionEnhancedHero
        collectionTitle={collection.title}
        collectionDescription={collection.description ?? undefined}
        enhancedData={enhancedData}
      />

      {hubMode && subcollectionLinks?.length ? (
        <div
          className="fadeIn relative z-10 w-full max-w-3xl mx-auto px-1"
          style={{animationDelay: '100ms'}}
        >
          <h2 className="sr-only">Wybierz kruszec</h2>
          {missingSubcollection ? (
            <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-100/50 px-4 py-3 text-sm text-amber-900">
              Kolekcja „{missingSubcollection.label}” nie jest obecnie
              dostępna. Sprawdź, czy jest opublikowana w kanale Headless.
            </p>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {subcollectionLinks.map((sub) => (
              <Link
                key={sub.handle}
                to={`/collections/${sub.handle}`}
                className="group flex flex-col items-center justify-center rounded-lg border border-[rgb(var(--color-primary))]/20 bg-white/5 px-6 py-10 text-center transition hover:border-[rgb(var(--color-primary))]/40 hover:shadow-md"
              >
                <span className="text-xl font-semibold text-[rgb(var(--color-primary))] group-hover:opacity-80">
                  {sub.label}
                </span>
                <span className="mt-2 text-sm text-[rgb(var(--color-primary))]/60">
                  Zobacz pierścionki
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {!hubMode ? (
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
      ) : null}
    </section>
  );
}

const COLLECTION_QUERY = `#graphql
  query CollectionDetails(
    $handle: String!
    $cursor: String
    $productFirst: Int!
  ) {
    collection(handle: $handle) {
      id
      title
      description
      handle
      metafield(namespace: "custom", key: "collection_enhanced") {
        reference {
          ... on Metaobject {
            fields {
              key
              value
              reference {
                ... on Video {
                  mediaContentType
                  sources {
                    url
                    mimeType
                  }
                }
                ... on MediaImage {
                  image {
                    url
                    altText
                  }
                }
              }
              references(first: 24) {
                nodes {
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
      products(first: $productFirst, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          description
          publishedAt
          handle
          tags
          productType
          vendor
          metal: metafield(namespace: "custom", key: "metal") {
            value
          }
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

export const meta: MetaFunction<typeof loader> = ({data}) => {
  if (!data?.collection) {
    return [];
  }
  return getSeoMeta({
    title: data.collection.title ?? undefined,
    description: data.collection.description?.slice(0, 154) ?? undefined,
  });
};
