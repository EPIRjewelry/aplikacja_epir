import {json, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {Link, type MetaFunction} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';
import {CraftsmanshipStory, SocialProofBanner} from '@epir/ui';
import {KazkaAboutGemologySection} from '~/components/KazkaAboutGemologySection';
import {KazkaAboutProductionCards} from '~/components/KazkaAboutProductionCards';
import {KazkaEditorialVideoSection} from '~/components/KazkaEditorialVideoSection';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';
import {
  KAZKA_ABOUT_COLLECTION_CTA,
  KAZKA_ABOUT_GEMOLOGY,
  KAZKA_ABOUT_HERO,
  KAZKA_ABOUT_HISTORY,
  KAZKA_ABOUT_INSTAGRAM,
  KAZKA_ABOUT_PRODUCTION_CARDS,
  KAZKA_CRAFTSMANSHIP,
  KAZKA_SOCIAL_PROOF,
} from '~/lib/kazka-brand-copy';

export async function loader({context, request}: LoaderFunctionArgs) {
  return json({
    canonicalUrl: canonicalUrlFromRequest(request, context.env),
  });
}

export const meta: MetaFunction<typeof loader> = ({data}) =>
  getSeoMeta({
    title: 'O KAZKA JEWELRY — EPIR Art Jewellery',
    description:
      'O KAZKA JEWELRY: historia od 2014, produkcja w Polsce, selekcja diamentów przez gemmologów i Geometria Ciszy — bezpośrednio dla Ciebie.',
    url: data?.canonicalUrl,
  });

export default function AboutPage() {
  return (
    <div className="w-full font-sans">
      <header className="mx-auto max-w-3xl px-4 pb-8 pt-16 text-center md:px-8 md:pb-12 md:pt-24">
        <p className="kazka-editorial-label mb-4">
          {KAZKA_ABOUT_HERO.eyebrow}
        </p>
        <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight text-[rgb(var(--color-primary))] md:text-5xl">
          {KAZKA_ABOUT_HERO.title}
        </h1>
        <p className="mx-auto max-w-[45ch] font-sans leading-[1.6] text-[rgb(var(--color-primary))]/80 md:text-lg">
          {KAZKA_ABOUT_HERO.lead}
        </p>
      </header>

      <section
        aria-labelledby="kazka-history-heading"
        className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16"
      >
        <h2
          id="kazka-history-heading"
          className="mb-10 text-center font-serif text-2xl font-semibold tracking-tight text-[rgb(var(--color-primary))] md:text-3xl"
        >
          Nasza historia
        </h2>
        <ol className="space-y-12">
          {KAZKA_ABOUT_HISTORY.map((item) => (
            <li key={item.year} className="grid gap-3 md:grid-cols-[5rem_1fr] md:gap-8">
              <p className="font-sans text-sm font-semibold tabular-nums tracking-wider text-[rgb(var(--color-accent))] md:pt-1">
                {item.year}
              </p>
              <div>
                <h3 className="mb-2 font-serif text-lg font-semibold text-[rgb(var(--color-primary))]">
                  {item.title}
                </h3>
                <p className="font-sans leading-[1.6] text-[rgb(var(--color-primary))]/80">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <CraftsmanshipStory {...KAZKA_CRAFTSMANSHIP} />
      <KazkaAboutProductionCards cards={KAZKA_ABOUT_PRODUCTION_CARDS} />
      <KazkaEditorialVideoSection />
      <KazkaAboutGemologySection
        {...KAZKA_ABOUT_GEMOLOGY}
        instagram={KAZKA_ABOUT_INSTAGRAM}
      />
      <SocialProofBanner {...KAZKA_SOCIAL_PROOF} />

      <section className="mx-auto max-w-3xl px-4 pb-16 pt-4 text-center md:px-8 md:pb-24">
        <Link
          to={KAZKA_ABOUT_COLLECTION_CTA.href}
          className="kazka-editorial-cta inline-block no-underline"
          prefetch="intent"
        >
          {KAZKA_ABOUT_COLLECTION_CTA.label}
        </Link>
      </section>
    </div>
  );
}
