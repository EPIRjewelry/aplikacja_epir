import type {CampaignLandingData} from './campaign';
import type {Env} from './env';
import {appendAttributionParams, renderLandingAttributionScript, renderLandingTrackingBody, renderLandingTrackingHead} from './landing-attribution';
import {
  renderAtelier3DPlaceholder,
  renderMotionScript,
  renderWarsztatPlaceholder,
} from './landing-sections';
import {renderHeroPicture} from './hero-picture';
import type {LandingRenderOpts} from './render-landing';
import {
  absoluteStoreUrl,
  escapeHtml,
  renderEditorialHead,
  renderFooter,
  renderMobileMenuScript,
  renderNav,
  renderProductStrip,
  storeOrigin,
  type ProductNode,
} from './render-shared';
import {
  productNodeToHeroInput,
  resolveHeroImage,
} from './stone-profile-hero';

export const ORGANIC_ART_HANDLE = 'organic-art-landing';

const ORGANIC_THEME = {
  heroMode: 'light' as const,
};

/** Full editorial landing for organic_art (Strona 1) on l.epirbizuteria.pl */
export function renderOrganicArtLandingHtml(
  env: Env,
  campaign: CampaignLandingData,
  products: ProductNode[],
  opts?: LandingRenderOpts,
): string {
  const store = storeOrigin(env);
  const attrSearch = opts?.attributionSearch ?? '';
  const collectionUrl = appendAttributionParams(
    absoluteStoreUrl(env, campaign.ctaUrl || '/collections/kolekcja-galazki'),
    attrSearch,
  );
  const heroTitle = campaign.heroTitle || 'Biżuteria artystyczna';
  const productStrip = renderProductStrip({
    env,
    products,
    productIds: campaign.productIds,
    heading: 'Kolekcja Gałązki',
    eyebrow: 'Wybrane z pracowni',
    moreHref: collectionUrl,
    moreLabel: 'Zobacz więcej',
    attributionSearch: attrSearch,
  });

  const heroResolved = resolveHeroImage(
    products[0] ? productNodeToHeroInput(products[0]) : null,
  );
  const heroVisual = heroResolved
    ? renderHeroPicture({
        url: heroResolved.url,
        alt: heroResolved.alt,
        lcp: true,
        width: heroResolved.width,
        height: heroResolved.height,
      })
    : `<div class="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
              <div class="w-32 h-32 md:w-40 md:h-40 rounded-full stone-border border flex items-center justify-center mb-6 bg-white/60">
                <svg class="w-16 h-16 text-epir-accent/50" fill="none" stroke="currentColor" stroke-width="0.75" viewBox="0 0 64 64" aria-hidden="true">
                  <path d="M32 8 C20 20, 12 32, 16 48 C20 56, 44 56, 48 44 C52 32, 44 16, 32 8 Z"/>
                  <path d="M28 24 C32 20, 38 22, 40 28"/>
                </svg>
              </div>
              <p class="font-serif text-epir-muted text-sm italic">Makro — pierścień Gałązki na korze</p>
              <p class="text-epir-muted/70 text-xs mt-2 font-sans tracking-wider uppercase">Ujęcie produktowe — wkrótce</p>
            </div>`;

  return `<!DOCTYPE html>
<html lang="pl" class="scroll-smooth">
<head>
  ${renderEditorialHead({
    title: `${heroTitle} — EPIR Art Jewellery`,
    description:
      'Biżuteria, która ma teksturę, a nie filtry. Ręcznie kute formy inspirowane dolnośląskim lasem — wrocławska pracownia EPIR.',
    canonical: `${store}/`,
    theme: ORGANIC_THEME,
  })}
  ${renderLandingTrackingHead(env)}
</head>
<body class="font-sans text-epir-ink antialiased grain-overlay">
  ${renderLandingTrackingBody(env)}
  ${renderNav(store, {variant: 'organic'})}

  <main>
    <section class="pt-24 md:pt-32 pb-16 md:pb-24 hero-light reveal" aria-labelledby="hero-heading">
      <div class="mx-auto max-w-6xl px-5 md:px-8">
        <p class="text-epir-accent text-xs tracking-[0.3em] uppercase mb-4 font-sans">Rzeźbione ogniem, inspirowane chaosem natury</p>
        <div class="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <h1 id="hero-heading" class="font-serif text-4xl md:text-5xl lg:text-[3.25rem] leading-[1.12] text-epir-ink mb-6" data-dynamic-hero-title>
              Biżuteria, która ma teksturę, a&nbsp;nie filtry.
            </h1>
            <p class="text-epir-muted text-base md:text-lg leading-relaxed mb-8 max-w-lg" data-dynamic-hero-subtitle>
              Odrzucamy fabryczną powtarzalność. Odkryj rzeźbiarskie formy inspirowane dolnośląskim lasem, kute ręcznie we wrocławskiej pracowni.
            </p>
            <div class="flex flex-col sm:flex-row gap-4">
              <a href="${escapeHtml(collectionUrl)}" class="btn-cta inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on" data-dynamic-cta>
                Odkryj Kolekcję Gałązki
              </a>
              <a href="https://epirbizuteria.pl/pages/zaprojektuj-swoj-model" class="btn-outline inline-flex items-center justify-center px-8 py-3.5 rounded-full font-medium text-sm tracking-wide">
                Zaprojektuj z nami online
              </a>
            </div>
          </div>
          <figure class="hero-visual-light relative rounded-2xl overflow-hidden aspect-[4/5] md:aspect-square stone-ring" aria-label="Makro zbliżenie pierścionka Gałązki na wilgotnej korze drzewa — surowa tekstura i polerowane srebro">
            ${heroVisual}
          </figure>
        </div>
      </div>
    </section>

    <section id="pracownia" class="panel-cream texture-organic py-20 md:py-28 border-y border-epir-accent/10 reveal" aria-labelledby="manifesto-heading">
      <div class="mx-auto max-w-4xl px-5 md:px-8 text-center">
        <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Żywa powierzchnia</p>
        <h2 id="manifesto-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-8 italic">Ślad procesu, nie wada</h2>
        <div class="space-y-6 text-epir-muted text-base md:text-lg leading-relaxed text-left md:text-center">
          <p>
            W świecie biżuterii masowej każdy element jest identyczny — wypolerowany do lustrzanego połysku, pozbawiony śladów narzędzi. My idziemy w przeciwnym kierunku.
          </p>
          <p>
            Organiczne pęknięcia, asymetryczne skręty gałęzi, pory surowego metalu — to nie wady produkcyjne. To świadome ślady ludzkich dłoni i ognia warsztatowego. Każdy egzemplarz nosi historię procesu, w którym materiał współpracuje z rzemieślnikiem, a nie jest tylko poddany maszynie.
          </p>
        </div>
        <blockquote class="quote-block mt-12 px-6 py-8 md:px-10 text-left md:text-center rounded-r-lg">
          <p class="font-serif text-xl md:text-2xl text-epir-ink leading-snug italic">
            „Rzemiosło, które nie dekoruje — współistnieje z dłonią."
          </p>
        </blockquote>
      </div>
    </section>

    ${renderAtelier3DPlaceholder()}
    ${renderWarsztatPlaceholder()}

    <section class="py-20 md:py-28 panel-secondary reveal" aria-labelledby="featured-heading">
      <div class="mx-auto max-w-6xl px-5 md:px-8">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <figure class="product-frame rounded-2xl aspect-square flex items-center justify-center stone-border border overflow-hidden" aria-label="Pierścień Gałązki z czarnym turmalinem — render produktowy">
            <div class="text-center p-8">
              <svg class="w-24 h-24 mx-auto text-epir-accent/40 mb-4" fill="none" stroke="currentColor" stroke-width="0.75" viewBox="0 0 80 80" aria-hidden="true">
                <ellipse cx="40" cy="44" rx="28" ry="24"/>
                <path d="M40 20 C34 28, 30 36, 32 44 C34 50, 46 50, 48 44 C50 36, 46 28, 40 20 Z"/>
                <circle cx="40" cy="36" r="6" fill="currentColor" opacity="0.4"/>
              </svg>
              <p class="font-serif text-epir-muted text-sm">Pierścień „Gałązki"</p>
            </div>
          </figure>
          <div>
            <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Flagowy model</p>
            <h2 id="featured-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6">Pierścień „Gałązki" z Czarnym Turmalinem</h2>
            <div class="space-y-4 text-epir-muted leading-relaxed">
              <p>
                Surowy, nieokiełznany czarny turmalin — jak węgielny fragment nocnego lasu — osadzony w ręcznie formowanych, gałązkowatych szponach ze srebra próby 925. Metal nie udaje gładkości; zachowuje ślady młotka i selektywnej oksydacji, które podkreślają rzeźbiarski charakter formy.
              </p>
              <p>
                Dotykając go, czujesz chłód kamienia i ciepło metalu jednocześnie — dwa światy: mineralny i organiczny, połączone ogniem lutowniczym w jednej, niepowtarzalnej kompozycji.
              </p>
            </div>
            <div class="mt-8 inline-flex items-start gap-3 px-4 py-3 rounded-lg stone-border border bg-epir-field">
              <svg class="w-5 h-5 text-epir-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              <p class="text-xs text-epir-muted leading-relaxed">
                <span class="text-epir-accent font-medium">Technical Authority:</span> Srebro próby 925, poddane selektywnej, głębokiej oksydacji i ręcznemu polerowaniu.
              </p>
            </div>
            <a href="${escapeHtml(collectionUrl)}" class="btn-cta inline-flex mt-8 px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on">
              Zobacz Kolekcję Gałązki
            </a>
          </div>
        </div>
      </div>
    </section>

    ${productStrip}

    <section id="wspoltworzenie" class="panel-cream py-20 md:py-28 border-t border-epir-accent/10" aria-labelledby="cocreate-heading">
      <div class="mx-auto max-w-3xl px-5 md:px-8 text-center">
        <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">Twój pomysł. Nasz ogień. Stwórzmy coś, co nie istnieje.</p>
        <h2 id="cocreate-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6">
          Nie ma tego w siatce? Zaprojektujmy formę razem online.
        </h2>
        <p class="text-epir-muted text-base leading-relaxed mb-8">
          Opisz wizję albo prześlij szkic — przełożymy ją na model 3D, a po Twojej akceptacji odlejemy i wykończymy ręcznie we Wrocławiu.
        </p>
        <a href="https://epirbizuteria.pl/pages/zaprojektuj-swoj-model" class="btn-cta inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on">
          Przejdź do projektowania
        </a>
      </div>
    </section>
  </main>

  ${renderFooter(store)}

  ${renderMobileMenuScript()}
  ${renderLandingAttributionScript(env, {pageSearch: attrSearch})}
  ${renderMotionScript()}
</body>
</html>`;
}
