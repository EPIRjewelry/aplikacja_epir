import {Link, useLoaderData} from '@remix-run/react';
import {json, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';
import {ProductCard} from '@epir/ui';

type SearchProductNode = {
  id: string;
  handle: string;
  title: string;
  onlineStoreUrl?: string | null;
  featuredImage?: {
    id?: string;
    altText?: string | null;
    url: string;
  } | null;
  priceRange?: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
    maxVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  } | null;
  variants?: {
    nodes?: Array<{
      id: string;
      price: {amount: string; currencyCode: string};
      compareAtPrice?: {amount: string; currencyCode: string} | null;
      image?: {
        id?: string;
        altText?: string | null;
        url: string;
      } | null;
    }>;
  } | null;
};

const SEARCH_QUERY = `#graphql
  query SearchProducts($query: String!) {
    products(first: 20, query: $query) {
      nodes {
        id
        handle
        title
        onlineStoreUrl
        featuredImage {
          id
          altText
          url
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 1) {
          nodes {
            id
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            image {
              id
              altText
              url
            }
          }
        }
      }
    }
  }
`;
type SearchQueryData = {
  products?: {
    nodes: Array<SearchProductNode>;
  };
};

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return json({q, products: [] as SearchProductNode[]} satisfies {
      q: string;
      products: SearchProductNode[];
    });
  }

  const data = await context.storefront.query<SearchQueryData>(SEARCH_QUERY, {
    variables: {query: q},
  });

  const products = data?.products?.nodes ?? [];
  return json({q, products});
}

const linkClass =
  'font-medium text-[#2c684e] no-underline underline-offset-4 transition-[color,text-decoration-color] duration-150 ease-out hover:text-[#8a8175] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2';

export default function Search() {
  const {q, products} = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto mt-12 max-w-7xl px-6 pb-12 md:mt-16 md:px-8 lg:px-12">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-[rgb(var(--color-primary))]">
        Wyszukiwanie produktów
      </h1>

      <form method="get" action="/search" className="mb-8 flex flex-wrap gap-2">
        <label htmlFor="search-q" className="sr-only">
          Fraza wyszukiwania
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Np. pierścionek, złoto…"
          autoComplete="off"
          className="min-w-[12rem] flex-1 rounded-md border border-black/15 bg-[var(--color-header-bg,#F5F0E8)] px-3 py-2 text-sm text-[rgb(var(--color-primary))] placeholder:text-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2"
        />
        <button
          type="submit"
          className="rounded-md bg-[#2c684e] px-4 py-2 text-sm font-medium text-[#F5F0E8] transition-colors hover:bg-[#245540] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2"
        >
          Szukaj
        </button>
      </form>

      {!q ? (
        <>
          <p className="mb-4 text-base leading-relaxed text-black/70">
            Podaj frazę do wyszukania — wpisz ją powyżej lub dodaj parametr{' '}
            <code className="rounded bg-black/5 px-1 py-0.5 text-sm">?q=…</code> w adresie URL.
          </p>
          <p className="mb-8 text-base leading-relaxed text-black/70">
            Pełniejszy układ wyników i dodatkowe filtry pojawią się w kolejnych iteracjach.
          </p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Przejście dalej">
            <Link to="/collections" className={linkClass}>
              Kolekcje
            </Link>
            <Link to="/" className={linkClass}>
              Strona główna
            </Link>
          </nav>
        </>
      ) : products.length === 0 ? (
        <p className="text-base leading-relaxed text-black/70">
          Brak wyników dla „{q}”. Spróbuj innej frazy lub przejdź do{' '}
          <Link to="/collections" className={linkClass}>
            kolekcji
          </Link>
          .
        </p>
      ) : (
        <section className="mt-8 w-full" aria-labelledby="search-results-heading">
          <h2
            id="search-results-heading"
            className="mb-4 text-sm font-medium text-black/70"
          >
            Wyniki wyszukiwania dla „{q}” ({products.length}
            {products.length >= 20 ? '+' : ''})
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {/*
              Filtrowanie produktów bez sensownego pierwszego wariantu (brak ceny),
              żeby ProductCard zawsze miał pełne dane.
            */}
            {products
              .filter((p) => {
                const variant = p.variants?.nodes?.[0];
                return !!(variant && variant.price && variant.price.amount);
              })
              .map((p) => (
                <ProductCard key={p.id} product={p as Product} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
