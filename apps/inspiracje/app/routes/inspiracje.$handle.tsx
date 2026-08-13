import type {LoaderFunctionArgs, MetaFunction} from '@remix-run/cloudflare';
import {json} from '@remix-run/cloudflare';
import {Link, useLoaderData} from '@remix-run/react';
import {
  getArchiveItem,
  getArchiveSnapshot,
  plainTextFromHtml,
  resolveCtaUrl,
} from '~/lib/archive';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';

export const meta: MetaFunction<typeof loader> = ({data}) => {
  if (!data?.item) {
    return [{title: 'Nie znaleziono — Archiwum Inspiracji'}];
  }
  const title = `${data.item.title} — Archiwum Inspiracji | EPIR`;
  const description =
    data.description ||
    'Wyrob z archiwum EPIR — inspiracja do zamówienia indywidualnego.';
  const url = data.canonicalUrl;
  const image = data.item.featuredImage?.url || data.item.images[0]?.url;
  return [
    {title},
    {name: 'description', content: description},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    ...(url ? [{property: 'og:url', content: url}] : []),
    ...(image ? [{property: 'og:image', content: image}] : []),
    {property: 'og:type', content: 'article'},
  ];
};

export async function loader({context, params, request}: LoaderFunctionArgs) {
  const handle = params.handle || '';
  const item = getArchiveItem(handle);
  if (!item) {
    throw new Response('Not Found', {status: 404});
  }

  const archive = getArchiveSnapshot();
  const ctaUrl = resolveCtaUrl(context.env.PUBLIC_CTA_URL);

  return json({
    item,
    ctaUrl,
    ctaLabel: archive.ctaLabel,
    description: plainTextFromHtml(item.descriptionHtml, 180),
    canonicalUrl: canonicalUrlFromRequest(
      request,
      context.env.PUBLIC_STOREFRONT_URL,
    ),
  });
}

export default function InspirationDetail() {
  const {item, ctaUrl, ctaLabel} = useLoaderData<typeof loader>();
  const gallery =
    item.images?.length > 0
      ? item.images
      : item.featuredImage
        ? [item.featuredImage]
        : [];
  const hero = gallery[0];

  return (
    <article className="mx-auto max-w-6xl px-6 py-10 md:px-8 md:py-16 lg:px-12">
      <nav className="mb-8 text-sm text-epir-muted" aria-label="Okruszki">
        <Link to="/" className="hover:text-epir-accent hover:underline">
          Galeria
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-epir-ink">{item.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden bg-[#e8e4da]">
            {hero?.url ? (
              <img
                src={hero.url}
                alt={hero.altText || item.title}
                width={hero.width ?? 1200}
                height={hero.height ?? 1200}
                className="h-full w-full object-cover animate-fade-in"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-epir-muted">
                Brak zdjęcia
              </div>
            )}
          </div>
          {gallery.length > 1 ? (
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {gallery.slice(1).map((img) => (
                <li key={img.url} className="aspect-square overflow-hidden bg-[#e8e4da]">
                  <img
                    src={img.url}
                    alt={img.altText || item.title}
                    width={img.width ?? 400}
                    height={img.height ?? 400}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-epir-accent">
            Archiwum · inspiracja
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-epir-ink md:text-4xl">
            {item.title}
          </h1>
          {item.productType ? (
            <p className="mt-2 text-sm uppercase tracking-wider text-epir-muted">
              {item.productType}
            </p>
          ) : null}

          {item.descriptionHtml ? (
            <div
              className="prose-archive mt-8 max-w-none text-base"
              dangerouslySetInnerHTML={{__html: item.descriptionHtml}}
            />
          ) : (
            <p className="mt-8 text-epir-muted">
              Opis niedostępny — skontaktuj się z pracownią, aby omówić podobny
              model.
            </p>
          )}

          <p className="mt-8 border-l-2 border-epir-accent/40 pl-4 text-sm leading-relaxed text-epir-muted">
            Ten wyrób został sprzedany. Nie jest dostępny w sklepie — może
            posłużyć jako punkt wyjścia do projektu indywidualnego.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href={ctaUrl}
              className="inline-flex items-center justify-center bg-epir-accent px-8 py-3.5 text-sm font-semibold tracking-wide text-epir-on transition-colors hover:bg-epir-accent-hover"
            >
              {ctaLabel}
            </a>
            <Link
              to="/"
              className="inline-flex items-center justify-center border border-epir-ink/25 px-8 py-3.5 text-sm font-medium text-epir-ink transition-colors hover:border-epir-accent hover:text-epir-accent"
            >
              Wróć do galerii
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
