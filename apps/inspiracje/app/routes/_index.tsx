import type {LoaderFunctionArgs, MetaFunction} from '@remix-run/cloudflare';
import {json, redirect} from '@remix-run/cloudflare';
import {Link, useLoaderData} from '@remix-run/react';
import {ArchiveCard} from '~/components/ArchiveCard';
import {
  getArchiveSnapshot,
  paginateArchiveItems,
  parsePageParam,
  resolveCtaUrl,
  toArchiveCard,
} from '~/lib/archive';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';

function pageHref(page: number): string {
  return page <= 1 ? '/#galeria' : `/?page=${page}#galeria`;
}

export const meta: MetaFunction<typeof loader> = ({data}) => {
  const title = 'Archiwum Inspiracji — EPIR Art Jewellery';
  const description =
    'Wyroby sprzedane z pracowni EPIR — galeria inspiracji do zamówień indywidualnych. Bez cen, z historią formy i rzemiosła.';
  const url = data?.canonicalUrl;
  const links: Array<Record<string, string>> = [];
  if (data?.prevPage) {
    links.push({
      tagName: 'link',
      rel: 'prev',
      href: data.prevPage === 1 ? '/' : `/?page=${data.prevPage}`,
    });
  }
  if (data?.nextPage) {
    links.push({
      tagName: 'link',
      rel: 'next',
      href: `/?page=${data.nextPage}`,
    });
  }
  return [
    {title},
    {name: 'description', content: description},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    ...(url ? [{property: 'og:url', content: url}] : []),
    {property: 'og:type', content: 'website'},
    ...links,
  ];
};

export async function loader({context, request}: LoaderFunctionArgs) {
  const archive = getArchiveSnapshot();
  const requestedPage = parsePageParam(request.url);
  const {pageItems, page, totalPages, total} = paginateArchiveItems(
    archive.items,
    requestedPage,
  );

  // Poza zakresem (np. ?page=999) → ostatnia strona; ?page=0 już znormalizowane do 1.
  if (total > 0 && requestedPage > totalPages) {
    throw redirect(totalPages <= 1 ? '/' : `/?page=${totalPages}`);
  }

  const ctaUrl = resolveCtaUrl(context.env.PUBLIC_CTA_URL);
  const cards = pageItems.map(toArchiveCard);

  return json({
    items: cards,
    count: total,
    page,
    totalPages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null,
    ctaUrl,
    ctaLabel: archive.ctaLabel,
    exportedAt: archive.exportedAt,
    canonicalUrl: canonicalUrlFromRequest(
      request,
      context.env.PUBLIC_STOREFRONT_URL,
    ),
  });
}

function Pagination({
  page,
  totalPages,
  prevPage,
  nextPage,
}: {
  page: number;
  totalPages: number;
  prevPage: number | null;
  nextPage: number | null;
}) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);

  return (
    <nav
      className="mt-14 flex flex-wrap items-center justify-center gap-2"
      aria-label="Paginacja galerii"
    >
      {prevPage ? (
        <Link
          to={pageHref(prevPage)}
          prefetch="intent"
          className="inline-flex min-w-[7rem] items-center justify-center border border-epir-ink/25 px-4 py-2.5 text-sm font-medium text-epir-ink transition-colors hover:border-epir-accent hover:text-epir-accent"
        >
          Poprzednia
        </Link>
      ) : (
        <span className="inline-flex min-w-[7rem] items-center justify-center border border-transparent px-4 py-2.5 text-sm text-epir-muted/50">
          Poprzednia
        </span>
      )}

      <ol className="flex flex-wrap items-center gap-1">
        {start > 1 ? (
          <>
            <li>
              <Link
                to={pageHref(1)}
                prefetch="intent"
                className="inline-flex h-10 min-w-[2.5rem] items-center justify-center px-2 text-sm text-epir-ink hover:text-epir-accent"
              >
                1
              </Link>
            </li>
            {start > 2 ? (
              <li className="px-1 text-epir-muted" aria-hidden>
                …
              </li>
            ) : null}
          </>
        ) : null}
        {pages.map((p) => (
          <li key={p}>
            {p === page ? (
              <span
                aria-current="page"
                className="inline-flex h-10 min-w-[2.5rem] items-center justify-center bg-epir-accent px-2 text-sm font-semibold text-epir-on"
              >
                {p}
              </span>
            ) : (
              <Link
                to={pageHref(p)}
                prefetch="intent"
                className="inline-flex h-10 min-w-[2.5rem] items-center justify-center px-2 text-sm text-epir-ink hover:text-epir-accent"
              >
                {p}
              </Link>
            )}
          </li>
        ))}
        {end < totalPages ? (
          <>
            {end < totalPages - 1 ? (
              <li className="px-1 text-epir-muted" aria-hidden>
                …
              </li>
            ) : null}
            <li>
              <Link
                to={pageHref(totalPages)}
                prefetch="intent"
                className="inline-flex h-10 min-w-[2.5rem] items-center justify-center px-2 text-sm text-epir-ink hover:text-epir-accent"
              >
                {totalPages}
              </Link>
            </li>
          </>
        ) : null}
      </ol>

      {nextPage ? (
        <Link
          to={pageHref(nextPage)}
          prefetch="intent"
          className="inline-flex min-w-[7rem] items-center justify-center border border-epir-ink/25 px-4 py-2.5 text-sm font-medium text-epir-ink transition-colors hover:border-epir-accent hover:text-epir-accent"
        >
          Następna
        </Link>
      ) : (
        <span className="inline-flex min-w-[7rem] items-center justify-center border border-transparent px-4 py-2.5 text-sm text-epir-muted/50">
          Następna
        </span>
      )}
    </nav>
  );
}

export default function Index() {
  const {items, count, page, totalPages, prevPage, nextPage, ctaUrl, ctaLabel} =
    useLoaderData<typeof loader>();

  return (
    <>
      <section
        className="relative overflow-hidden border-b border-epir-ink/10"
        aria-labelledby="archive-hero-heading"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(ellipse at 20% 0%, rgba(44,104,78,0.12), transparent 55%), radial-gradient(ellipse at 90% 30%, rgba(240,235,224,0.9), transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24 lg:px-12">
          <p className="animate-fade-in text-xs font-semibold uppercase tracking-[0.2em] text-epir-accent">
            EPIR Art Jewellery
          </p>
          <h1
            id="archive-hero-heading"
            className="animate-fade-in-up mt-4 max-w-3xl text-4xl font-semibold leading-tight text-epir-ink md:text-5xl lg:text-6xl"
          >
            Archiwum Inspiracji
          </h1>
          <p className="animate-fade-in-up mt-5 max-w-2xl text-base leading-relaxed text-epir-muted md:text-lg">
            Wyroby, które już znalazły właścicieli. Zachowujemy zdjęcia i opisy
            jako inspirację do zamówień indywidualnych.
          </p>
          <div className="animate-fade-in-up mt-8 flex flex-wrap items-center gap-4">
            <a
              href={ctaUrl}
              className="inline-flex items-center justify-center bg-epir-accent px-8 py-3.5 text-sm font-semibold tracking-wide text-epir-on transition-colors hover:bg-epir-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-epir-accent focus-visible:outline-offset-2"
            >
              {ctaLabel}
            </a>
            <a
              href="#galeria"
              className="inline-flex items-center justify-center border border-epir-ink/25 px-8 py-3.5 text-sm font-medium tracking-wide text-epir-ink transition-colors hover:border-epir-accent hover:text-epir-accent"
            >
              Przeglądaj galerię
            </a>
          </div>
        </div>
      </section>

      <section
        id="galeria"
        className="mx-auto max-w-7xl px-6 py-14 md:px-8 md:py-20 lg:px-12"
        aria-labelledby="gallery-heading"
      >
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="gallery-heading"
              className="text-2xl font-semibold text-epir-ink md:text-3xl"
            >
              Galeria
            </h2>
            <p className="mt-2 text-sm text-epir-muted">
              {count > 0
                ? `${count} ${count === 1 ? 'wyrob' : 'wyrobów'} w archiwum · strona ${page} z ${totalPages}`
                : 'Eksport jeszcze nie wypełnił archiwum — uruchom scripts/export-archive-inspirations.mjs'}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-sm border border-dashed border-epir-ink/20 bg-white/40 px-6 py-16 text-center">
            <p className="text-epir-ink">Brak pozycji w snapshotcie.</p>
            <p className="mt-2 text-sm text-epir-muted">
              Po eksporcie z Admin API (`tag:sprzedane`) galeria wypełni się
              automatycznie.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block text-sm font-semibold text-epir-accent underline-offset-4 hover:underline"
            >
              Odśwież po eksporcie
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, index) => (
                <ArchiveCard
                  key={item.id || item.handle}
                  item={item}
                  index={index}
                />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              prevPage={prevPage}
              nextPage={nextPage}
            />
          </>
        )}
      </section>

      <section
        className="border-t border-epir-ink/10 bg-epir-cream/60"
        aria-labelledby="cocreate-heading"
      >
        <div className="mx-auto max-w-3xl px-6 py-16 text-center md:px-8 md:py-20">
          <h2
            id="cocreate-heading"
            className="text-2xl font-semibold text-epir-ink md:text-3xl"
          >
            Współtwórz swój model
          </h2>
          <p className="mt-4 text-base leading-relaxed text-epir-muted">
            Archiwum nie sprzedaje — inspiruje. Opisz pomysł lub wyślij szkic;
            pracownia EPIR przygotuje propozycję indywidualną.
          </p>
          <a
            href={ctaUrl}
            className="mt-8 inline-flex items-center justify-center bg-epir-accent px-8 py-3.5 text-sm font-semibold tracking-wide text-epir-on transition-colors hover:bg-epir-accent-hover"
          >
            {ctaLabel}
          </a>
        </div>
      </section>
    </>
  );
}
