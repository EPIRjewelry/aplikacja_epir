import {json, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {type MetaFunction} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';
import {
  CraftsmanshipStory,
  GemologySection,
  SocialProofBanner,
} from '@epir/ui';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';
import {
  KAZKA_ABOUT_HERO,
  KAZKA_ABOUT_HISTORY,
  KAZKA_CRAFTSMANSHIP,
  KAZKA_GEMOLOGY,
  KAZKA_SOCIAL_PROOF,
} from '~/lib/kazka-brand-copy';

export async function loader({context, request}: LoaderFunctionArgs) {
  return json({
    canonicalUrl: canonicalUrlFromRequest(request, context.env),
  });
}

export const meta: MetaFunction<typeof loader> = ({data}) =>
  getSeoMeta({
    title: 'O marce KAZKA — EPIR Art Jewellery',
    description:
      'Historia marki KAZKA od 2014 roku: lokalne rzemiosło w Polsce, selekcja diamentów przez gemmologów i Geometria Ciszy.',
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
      <GemologySection {...KAZKA_GEMOLOGY} />
      <SocialProofBanner {...KAZKA_SOCIAL_PROOF} />
    </div>
  );
}
