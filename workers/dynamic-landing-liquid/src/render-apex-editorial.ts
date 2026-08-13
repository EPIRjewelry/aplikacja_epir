import type {CampaignLandingData} from './campaign';
import type {Env} from './env';
import {getLandingCopy} from './landing-copy';
import {renderHeroPicture} from './hero-picture';
import type {LandingRenderOpts} from './render-landing';
import {
  renderAtelier3DPlaceholder,
  renderDigitalCocreation,
  renderEngravingHaptics,
  renderKazkaBridge,
  renderMotionScript,
  renderSilverCrossBridge,
  renderTechnicalAuthorityTable,
  renderTechnicalFoundry,
  renderWarsztatPlaceholder,
} from './landing-sections';
import {
  absoluteStoreUrl,
  escapeHtml,
  heroSectionClass,
  heroVisualClass,
  renderEditorialHead,
  renderFooter,
  renderMobileMenuScript,
  renderNav,
  renderProcessSection,
  renderProductStrip,
  storeOrigin,
  type ProductNode,
} from './render-shared';
import {appendAttributionParams, renderLandingAttributionScript, renderLandingTrackingBody, renderLandingTrackingHead} from './landing-attribution';
import {
  productNodeToHeroInput,
  resolveHeroImage,
} from './stone-profile-hero';

export const ARTISAN_GOLD_HANDLE = 'artisan-gold-landing';
export const ARTISAN_RINGS_HANDLE = 'artisan-rings-landing';
export const FOREST_PREMIUM_HANDLE = 'forest-premium-landing';

function renderCocreateTeaser(copy: {
  cocreateEyebrow: string;
  cocreateTitle: string;
}): string {
  return `<section id="wspoltworzenie" class="panel-cream py-20 md:py-28 border-t border-epir-accent/10" aria-labelledby="cocreate-heading">
    <div class="mx-auto max-w-3xl px-5 md:px-8 text-center">
      <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">${escapeHtml(copy.cocreateEyebrow)}</p>
      <h2 id="cocreate-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6">${escapeHtml(copy.cocreateTitle)}</h2>
      <p class="text-epir-muted text-base leading-relaxed mb-8">
        Opisz wizję albo prześlij szkic — przełożymy ją na model 3D, a po Twojej akceptacji odlejemy i wykończymy ręcznie we Wrocławiu.
      </p>
      <a href="https://epirbizuteria.pl/pages/zaprojektuj-swoj-model" class="btn-cta inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on">
        Rozpocznij projektowanie online
      </a>
    </div>
  </section>`;
}

function heroVisualHtml(
  featured: ProductNode | undefined,
  fallbackTitle: string,
): string {
  const resolved = resolveHeroImage(
    featured ? productNodeToHeroInput(featured) : null,
  );
  if (resolved) {
    return renderHeroPicture({
      url: resolved.url,
      alt: resolved.alt,
      lcp: true,
      width: resolved.width,
      height: resolved.height,
    });
  }
  return `<div class="text-center p-8">
        <p class="font-serif text-epir-muted text-sm">${escapeHtml(fallbackTitle)}</p>
      </div>`;
}

function featuredVisualHtml(
  featured: ProductNode | undefined,
  fallbackTitle: string,
): string {
  const resolved = resolveHeroImage(
    featured ? productNodeToHeroInput(featured) : null,
  );
  if (resolved) {
    return renderHeroPicture({
      url: resolved.url,
      alt: resolved.alt,
      lcp: false,
      width: resolved.width,
      height: resolved.height,
    });
  }
  return `<div class="text-center p-8">
        <p class="font-serif text-epir-muted text-sm">${escapeHtml(fallbackTitle)}</p>
      </div>`;
}

/** Full editorial for forest_premium, artisan_rings, artisan_gold. */
export function renderApexEditorialHtml(
  env: Env,
  campaign: CampaignLandingData,
  products: ProductNode[],
  opts?: LandingRenderOpts,
): string {
  const copy = getLandingCopy(campaign.handle);
  if (!copy) {
    throw new Error(`No landing copy for handle: ${campaign.handle}`);
  }

  const isRings = campaign.handle === ARTISAN_RINGS_HANDLE;
  const isForest = campaign.handle === FOREST_PREMIUM_HANDLE;
  const isGold = campaign.handle === ARTISAN_GOLD_HANDLE;

  const store = storeOrigin(env);
  const attrSearch = opts?.attributionSearch ?? '';
  const collectionUrl = appendAttributionParams(
    absoluteStoreUrl(env, campaign.ctaUrl || '/'),
    attrSearch,
  );
  const featured = products[0];
  const heroCls = heroSectionClass(copy.heroMode);
  const visualCls = heroVisualClass(copy.heroMode);
  const heroImg = heroVisualHtml(featured, copy.featuredTitle);
  const featuredImg = featuredVisualHtml(featured, copy.featuredTitle);

  const productStrip = renderProductStrip({
    env,
    products,
    productIds: campaign.productIds,
    heading: copy.gridHeading,
    eyebrow: copy.gridEyebrow,
    moreHref: collectionUrl,
    moreLabel: copy.moreLabel,
    attributionSearch: attrSearch,
  });

  const theme = {
    heroMode: copy.heroMode,
    accentStone: copy.accentStone,
  };

  const silverBridge = isRings
    ? renderSilverCrossBridge('rings_to_silver')
    : isForest
      ? renderSilverCrossBridge('silver_to_rings')
      : '';

  const engravingSection = isRings ? renderEngravingHaptics() : '';
  const foundrySection = isForest ? renderTechnicalFoundry() : '';
  const techAuthoritySection = isGold ? renderTechnicalAuthorityTable() : '';
  const cocreateSection = isGold
    ? renderDigitalCocreation()
    : renderCocreateTeaser(copy);
  const kazkaBridge = isGold ? renderKazkaBridge() : '';

  return `<!DOCTYPE html>
<html lang="pl" class="scroll-smooth">
<head>
  ${renderEditorialHead({
    title: `${campaign.heroTitle || copy.heroHeadline} — EPIR Art Jewellery`,
    description: copy.description,
    canonical: `${store}/`,
    theme,
  })}
  ${renderLandingTrackingHead(env)}
</head>
<body class="font-sans text-epir-ink antialiased grain-overlay">
  ${renderLandingTrackingBody(env)}
  ${renderNav(store)}
  <main>
    <section class="pt-24 md:pt-32 pb-16 md:pb-24 ${heroCls} reveal" aria-labelledby="hero-heading">
      <div class="mx-auto max-w-6xl px-5 md:px-8">
        <p class="text-epir-stone text-xs tracking-[0.3em] uppercase mb-4 font-sans opacity-90">${escapeHtml(copy.eyebrow)}</p>
        <div class="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <h1 id="hero-heading" class="font-serif text-4xl md:text-5xl leading-[1.12] mb-6" data-dynamic-hero-title>
              ${escapeHtml(copy.heroHeadline)}
            </h1>
            <p class="text-epir-muted text-base md:text-lg leading-relaxed mb-8 max-w-lg" data-dynamic-hero-subtitle>
              ${escapeHtml(copy.heroSub)}
            </p>
            <div class="flex flex-col sm:flex-row gap-4">
              <a href="${escapeHtml(collectionUrl)}" class="btn-cta inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on" data-dynamic-cta>
                ${escapeHtml(copy.primaryCta)}
              </a>
              <a href="https://epirbizuteria.pl/pages/zaprojektuj-swoj-model" class="btn-outline inline-flex items-center justify-center px-8 py-3.5 rounded-full font-medium text-sm tracking-wide">
                ${escapeHtml(copy.secondaryCta)}
              </a>
            </div>
          </div>
          <figure class="${visualCls} relative rounded-2xl overflow-hidden aspect-[4/5] md:aspect-square stone-ring">
            ${heroImg}
          </figure>
        </div>
      </div>
    </section>

    <section id="pracownia" class="panel-cream texture-organic py-20 md:py-28 border-y border-epir-accent/10 reveal" aria-labelledby="manifesto-heading">
      <div class="mx-auto max-w-4xl px-5 md:px-8 text-center">
        <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">${escapeHtml(copy.manifestoEyebrow)}</p>
        <h2 id="manifesto-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-8 italic">${escapeHtml(copy.manifestoTitle)}</h2>
        <div class="space-y-6 text-epir-muted text-base md:text-lg leading-relaxed text-left md:text-center">
          ${copy.manifestoBody.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
        </div>
        <blockquote class="quote-block mt-12 px-6 py-8 md:px-10 text-left md:text-center rounded-r-lg">
          <p class="font-serif text-xl md:text-2xl text-epir-ink leading-snug italic">„${escapeHtml(copy.quote)}"</p>
        </blockquote>
      </div>
    </section>

    ${renderAtelier3DPlaceholder()}
    ${renderProcessSection(copy.processSteps)}
    ${renderWarsztatPlaceholder()}
    ${foundrySection}
    ${techAuthoritySection}

    <section class="py-20 md:py-28 reveal" aria-labelledby="featured-heading">
      <div class="mx-auto max-w-6xl px-5 md:px-8">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <figure class="product-frame rounded-2xl aspect-square flex items-center justify-center stone-border border overflow-hidden">
            ${featuredImg}
          </figure>
          <div>
            <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans">${escapeHtml(copy.featuredEyebrow)}</p>
            <h2 id="featured-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-6">${escapeHtml(featured?.title || copy.featuredTitle)}</h2>
            <div class="space-y-4 text-epir-muted leading-relaxed">
              ${copy.featuredBody.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
            </div>
            <div class="mt-8 inline-flex items-start gap-3 px-4 py-3 rounded-lg stone-border border bg-epir-field">
              <p class="text-xs text-epir-muted leading-relaxed">
                <span class="text-epir-accent font-medium">Technical Authority:</span> ${escapeHtml(copy.technicalBadge)}
              </p>
            </div>
            ${
              featured?.handle
                ? `<a href="${escapeHtml(appendAttributionParams(absoluteStoreUrl(env, `/products/${featured.handle}`), attrSearch))}" class="btn-cta inline-flex mt-8 px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on">Zobacz produkt</a>`
                : `<a href="${escapeHtml(collectionUrl)}" class="btn-cta inline-flex mt-8 px-8 py-3.5 rounded-full font-semibold text-sm tracking-wide text-epir-on">${escapeHtml(copy.primaryCta)}</a>`
            }
          </div>
        </div>
      </div>
    </section>

    ${productStrip}
    ${engravingSection}
    ${silverBridge}
    ${cocreateSection}
    ${kazkaBridge}
  </main>
  ${renderFooter(store)}
  ${renderMobileMenuScript()}
  ${renderLandingAttributionScript(env, {pageSearch: attrSearch})}
  ${renderMotionScript()}
</body>
</html>`;
}
