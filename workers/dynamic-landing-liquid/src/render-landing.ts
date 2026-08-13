import type {CampaignLandingData} from './campaign';
import type {Env} from './env';
import {APEX_EDITORIAL_HANDLES} from './landing-copy';
import {renderApexEditorialHtml} from './render-apex-editorial';
import {
  ORGANIC_ART_HANDLE,
  renderOrganicArtLandingHtml,
} from './render-organic-art';
import {
  absoluteStoreUrl,
  escapeHtml,
  renderProductStrip,
  renderStoreFaviconLinks,
  type ProductNode,
} from './render-shared';
import {fetchStorefront} from './storefront';

export type LandingRenderOpts = {
  attributionSearch?: string;
};

/** Routes Ads standalone HTML to editorial templates (or legacy compact grid). */
export function renderStandaloneLandingHtml(
  env: Env,
  campaign: CampaignLandingData,
  products: ProductNode[],
  opts?: LandingRenderOpts,
): string {
  if (campaign.handle === ORGANIC_ART_HANDLE) {
    return renderOrganicArtLandingHtml(env, campaign, products, opts);
  }
  if (APEX_EDITORIAL_HANDLES.has(campaign.handle)) {
    return renderApexEditorialHtml(env, campaign, products, opts);
  }
  return renderCampaignLandingHtml(env, campaign, products, opts);
}

const PRODUCTS_QUERY = `
  query CampaignLandingProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        featuredImage { url altText width height }
        media(first: 10) {
          nodes {
            ... on MediaImage {
              image { url altText width height }
            }
          }
        }
        priceRange {
          minVariantPrice { amount currencyCode }
        }
      }
    }
  }
`;

export async function loadCampaignProducts(
  env: Env,
  productIds: string[],
): Promise<ProductNode[]> {
  if (!productIds.length) return [];
  const data = await fetchStorefront<{nodes: Array<ProductNode | null>}>(
    env,
    PRODUCTS_QUERY,
    {ids: productIds.slice(0, 12)},
  );
  return (data?.nodes ?? []).filter((n): n is ProductNode => Boolean(n?.id));
}

/** Legacy compact grid — fallback for unknown handles. */
export function renderCampaignLandingHtml(
  env: Env,
  campaign: CampaignLandingData,
  products: ProductNode[],
  opts?: LandingRenderOpts,
): string {
  const store = `https://${env.SHOPIFY_PUBLIC_DOMAIN?.trim() || 'epirbizuteria.pl'}`;
  const ctaHref = absoluteStoreUrl(env, campaign.ctaUrl || '/');
  const strip = renderProductStrip({
    env,
    products,
    productIds: campaign.productIds,
    heading: campaign.heroTitle || 'Kolekcja',
    eyebrow: 'Wybrane z pracowni',
    moreHref: ctaHref,
    moreLabel: campaign.ctaLabel || 'Zobacz więcej',
    attributionSearch: opts?.attributionSearch,
  });

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(campaign.heroTitle)} — EPIR</title>
  <meta name="robots" content="noindex" />
  <link rel="canonical" href="${escapeHtml(store)}/" />
  ${renderStoreFaviconLinks(store)}
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin:0; background:#0B0B0B; color:#f0ebe0; font-family: Georgia, serif; }
  </style>
</head>
<body>
  <main class="max-w-6xl mx-auto px-5 py-10">
    <div class="mb-6 text-xs tracking-widest uppercase opacity-60"><a href="${escapeHtml(store)}" class="no-underline text-inherit">EPIR Art Jewellery</a></div>
    <h1 data-dynamic-hero-title class="text-3xl md:text-4xl mb-4">${escapeHtml(campaign.heroTitle)}</h1>
    ${campaign.heroSubtitle ? `<p data-dynamic-hero-subtitle class="opacity-70 max-w-xl mb-6">${escapeHtml(campaign.heroSubtitle)}</p>` : ''}
    <a data-dynamic-cta href="${escapeHtml(ctaHref)}" class="inline-block px-6 py-3 rounded-full bg-[#D4AF37] text-[#1a1510] font-semibold no-underline">${escapeHtml(campaign.ctaLabel || 'Zobacz kolekcję')}</a>
    ${strip}
    <p class="mt-10 opacity-50 text-sm">Pełny sklep: <a href="${escapeHtml(store)}" class="text-[#D4AF37]">${escapeHtml(store.replace(/^https?:\/\//, ''))}</a></p>
  </main>
</body>
</html>`;
}

export function isAdsLandingHost(hostname: string, env: Env): boolean {
  const host = hostname.toLowerCase();
  const configured = (env.ADS_LANDING_HOST ?? 'l.epirbizuteria.pl').trim().toLowerCase();
  return host === configured || host.startsWith('l.');
}
