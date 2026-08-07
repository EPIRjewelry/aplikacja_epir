import type {Storefront} from '@shopify/hydrogen';

export const CAMPAIGN_LANDING_TYPE = '$app:campaign_landing';
/**
 * Storefront API: Headless token nie resolvuje `$app:` do custom app —
 * używamy reserved type utworzonego przez Admin token (Asystent Klienta).
 * Override: env PUBLIC_CAMPAIGN_LANDING_TYPE.
 */
export const CAMPAIGN_LANDING_TYPE_STOREFRONT_DEFAULT =
  'app--280344821761--campaign_landing';
export const CAMPAIGN_MAPPING_NAMESPACE = 'app';
export const CAMPAIGN_MAPPING_KEY = 'campaign_mapping';

export type CampaignMapping = Record<string, string>;

export type CampaignLandingData = {
  handle: string;
  heroTitle: string;
  heroSubtitle: string | null;
  productIds: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export type CampaignLandingProduct = {
  id: string;
  title: string;
  handle: string;
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  images: {
    nodes: Array<{
      url: string;
      altText: string | null;
      width: number | null;
      height: number | null;
    }>;
  };
  variants: {
    nodes: Array<{
      price: {amount: string; currencyCode: string};
      compareAtPrice: {amount: string; currencyCode: string} | null;
      image: {
        url: string;
        altText: string | null;
        width: number | null;
        height: number | null;
      } | null;
    }>;
  };
};

export type ResolveCampaignRedirectOptions = {
  /** Na homepage bez UTM nie używamy default; na /p tak. */
  allowDefault?: boolean;
};

export const CAMPAIGN_MAPPING_QUERY = `#graphql
  query CampaignMapping {
    shop {
      campaignMapping: metafield(namespace: "app", key: "campaign_mapping") {
        value
      }
    }
  }
`;

export const CAMPAIGN_LANDING_QUERY = `#graphql
  query CampaignLanding($handle: MetaobjectHandleInput!) {
    metaobject(handle: $handle) {
      id
      handle
      heroTitle: field(key: "hero_title") {
        value
      }
      heroSubtitle: field(key: "hero_subtitle") {
        value
      }
      productIds: field(key: "product_ids") {
        value
      }
      ctaLabel: field(key: "cta_label") {
        value
      }
      ctaUrl: field(key: "cta_url") {
        value
      }
    }
  }
`;

export const CAMPAIGN_PRODUCTS_BY_IDS_QUERY = `#graphql
  query CampaignProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        images(first: 1) {
          nodes {
            url
            altText
            width
            height
          }
        }
        variants(first: 1) {
          nodes {
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            image {
              url
              altText
              width
              height
            }
          }
        }
      }
    }
  }
`;

type CampaignMappingQueryResult = {
  shop: {
    campaignMapping: {value?: string | null} | null;
  };
};

type CampaignLandingQueryResult = {
  metaobject: {
    id: string;
    handle: string;
    heroTitle?: {value?: string | null};
    heroSubtitle?: {value?: string | null};
    productIds?: {value?: string | null};
    ctaLabel?: {value?: string | null};
    ctaUrl?: {value?: string | null};
  } | null;
};

type CampaignProductsQueryResult = {
  nodes: Array<CampaignLandingProduct | null>;
};

export function hasUtmParams(url: string | URL): boolean {
  const searchParams = new URL(url).searchParams;
  for (const [key] of searchParams.entries()) {
    if (key.toLowerCase().startsWith('utm_')) {
      return true;
    }
  }
  return false;
}

export function parseCampaignMapping(jsonValue: unknown): CampaignMapping {
  let raw: unknown = jsonValue;
  if (typeof jsonValue === 'string') {
    try {
      raw = JSON.parse(jsonValue);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const mapping: CampaignMapping = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim()) {
      mapping[key] = value.trim();
    }
  }
  return mapping;
}

export function parseProductIdsField(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // list.single_line_text_field może być zapisane jako pojedynczy GID
  }
  return [trimmed];
}

function isProductGid(id: string): boolean {
  return id.startsWith('gid://shopify/Product/');
}

export function resolveCampaignHandleFromUrl(
  url: string | URL,
  mapping: CampaignMapping,
  options: ResolveCampaignRedirectOptions = {},
): string | null {
  const {allowDefault = true} = options;
  const searchParams = new URL(url).searchParams;
  const utmCampaign = searchParams.get('utm_campaign')?.trim();

  if (utmCampaign && mapping[utmCampaign]) {
    return mapping[utmCampaign];
  }

  if (!utmCampaign && allowDefault && mapping.default) {
    return mapping.default;
  }

  return null;
}

/** Zwraca ścieżkę `/p/{handle}` lub null. */
export function resolveCampaignRedirect(
  url: string | URL,
  mapping: CampaignMapping,
  options: ResolveCampaignRedirectOptions = {},
): string | null {
  const handle = resolveCampaignHandleFromUrl(url, mapping, options);
  return handle ? `/p/${handle}` : null;
}

export async function fetchCampaignMapping(
  storefront: Storefront,
): Promise<CampaignMapping> {
  const {shop} = await storefront.query<CampaignMappingQueryResult>(
    CAMPAIGN_MAPPING_QUERY,
    {cache: storefront.CacheShort()},
  );
  return parseCampaignMapping(shop?.campaignMapping?.value);
}

function mapLandingMetaobject(
  metaobject: NonNullable<CampaignLandingQueryResult['metaobject']>,
): CampaignLandingData {
  return {
    handle: metaobject.handle,
    heroTitle: metaobject.heroTitle?.value?.trim() ?? '',
    heroSubtitle: metaobject.heroSubtitle?.value?.trim() ?? null,
    productIds: parseProductIdsField(metaobject.productIds?.value),
    ctaLabel: metaobject.ctaLabel?.value?.trim() ?? null,
    ctaUrl: metaobject.ctaUrl?.value?.trim() ?? null,
  };
}

export async function loadCampaignLanding(
  storefront: Storefront,
  handle: string,
  options: {metaobjectType?: string} = {},
): Promise<{landing: CampaignLandingData; products: CampaignLandingProduct[]} | null> {
  const metaobjectType =
    options.metaobjectType?.trim() || CAMPAIGN_LANDING_TYPE_STOREFRONT_DEFAULT;

  const {metaobject} = await storefront.query<CampaignLandingQueryResult>(
    CAMPAIGN_LANDING_QUERY,
    {
      variables: {
        handle: {type: metaobjectType, handle},
      },
      cache: storefront.CacheShort(),
    },
  );

  if (!metaobject) return null;

  const landing = mapLandingMetaobject(metaobject);
  if (!landing.heroTitle) return null;

  const productGids = landing.productIds.filter(isProductGid);
  if (productGids.length === 0) {
    return {landing, products: []};
  }

  const {nodes} = await storefront.query<CampaignProductsQueryResult>(
    CAMPAIGN_PRODUCTS_BY_IDS_QUERY,
    {
      variables: {ids: productGids},
      cache: storefront.CacheShort(),
    },
  );

  const products = (nodes ?? []).filter(
    (node): node is CampaignLandingProduct => node != null && Boolean(node.id),
  );

  return {landing, products};
}

export function campaignLandingCacheHeaders(_storefront?: Storefront): HeadersInit {
  // Jawny nagłówek — generateCacheControlHeader nie zawsze przechodzi przez CF Pages HTML.
  return {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
  };
}
