import {useLoaderData} from '@remix-run/react';
import {SeoHandleFunction} from '@shopify/hydrogen';
import {
  CollectionEnhancedHero,
  type CollectionEnhancedFlat,
  ProductGrid,
} from '@epir/ui';
import {json, redirect, type LoaderFunctionArgs} from '@remix-run/cloudflare';

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
      ? filter
          .split(',')
          .map((h: string) => h.trim())
          .filter(Boolean)
      : null;
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
    const firstHandle = nodes[0]?.handle ?? allowedHandles?.[0];
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

  return json({
    collection,
    enhancedData,
  });
}

export default function Collection() {
  const {collection, enhancedData} = useLoaderData<typeof loader>();

  return (
    <section className="w-full gap-8">
      <CollectionEnhancedHero
        collectionTitle={collection.title}
        collectionDescription={collection.description ?? undefined}
        enhancedData={enhancedData}
      />

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
  description: data?.collection?.description?.slice(0, 154) ?? undefined,
});
export const handle = {
  seo,
};
