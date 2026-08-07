import {
  DEFAULT_CAMPAIGN_LANDING_TYPE,
  LANDING_KV_TTL_SECONDS,
  MAPPING_KV_KEY,
  MAPPING_KV_TTL_SECONDS,
  type Env,
} from './env';
import {fetchStorefront} from './storefront';

export type CampaignMapping = Record<string, string>;

export type CampaignLandingData = {
  handle: string;
  heroTitle: string;
  heroSubtitle: string | null;
  productIds: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export type ResolveCampaignOptions = {
  allowDefault?: boolean;
};

export const CAMPAIGN_MAPPING_QUERY = `
  query CampaignMapping {
    shop {
      campaignMapping: metafield(namespace: "app", key: "campaign_mapping") {
        value
      }
    }
  }
`;

export const CAMPAIGN_LANDING_QUERY = `
  query CampaignLanding($handle: MetaobjectHandleInput!) {
    metaobject(handle: $handle) {
      handle
      heroTitle: field(key: "hero_title") { value }
      heroSubtitle: field(key: "hero_subtitle") { value }
      productIds: field(key: "product_ids") { value }
      ctaLabel: field(key: "cta_label") { value }
      ctaUrl: field(key: "cta_url") { value }
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
    handle: string;
    heroTitle?: {value?: string | null};
    heroSubtitle?: {value?: string | null};
    productIds?: {value?: string | null};
    ctaLabel?: {value?: string | null};
    ctaUrl?: {value?: string | null};
  } | null;
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
    // list.single_line_text_field may be a single GID
  }
  return [trimmed];
}

export function resolveCampaignHandleFromUrl(
  url: string | URL,
  mapping: CampaignMapping,
  options: ResolveCampaignOptions = {},
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

export async function loadCampaignMapping(env: Env): Promise<CampaignMapping> {
  const cached = await env.CAMPAIGN_CACHE?.get(MAPPING_KV_KEY);
  if (cached) {
    return parseCampaignMapping(cached);
  }

  const data = await fetchStorefront<CampaignMappingQueryResult>(
    env,
    CAMPAIGN_MAPPING_QUERY,
  );
  const mapping = parseCampaignMapping(data?.shop?.campaignMapping?.value);
  if (env.CAMPAIGN_CACHE && Object.keys(mapping).length > 0) {
    await env.CAMPAIGN_CACHE.put(MAPPING_KV_KEY, JSON.stringify(mapping), {
      expirationTtl: MAPPING_KV_TTL_SECONDS,
    });
  }
  return mapping;
}

export async function loadCampaignByHandle(
  env: Env,
  handle: string,
): Promise<CampaignLandingData | null> {
  const kvKey = `landing:${handle}`;
  const cached = await env.CAMPAIGN_CACHE?.get(kvKey);
  if (cached) {
    try {
      return JSON.parse(cached) as CampaignLandingData;
    } catch {
      // fall through to Storefront
    }
  }

  const metaobjectType =
    env.CAMPAIGN_LANDING_TYPE?.trim() || DEFAULT_CAMPAIGN_LANDING_TYPE;
  const data = await fetchStorefront<CampaignLandingQueryResult>(
    env,
    CAMPAIGN_LANDING_QUERY,
    {handle: {type: metaobjectType, handle}},
  );

  if (!data?.metaobject) return null;
  const landing = mapLandingMetaobject(data.metaobject);
  if (!landing.heroTitle) return null;

  if (env.CAMPAIGN_CACHE) {
    await env.CAMPAIGN_CACHE.put(kvKey, JSON.stringify(landing), {
      expirationTtl: LANDING_KV_TTL_SECONDS,
    });
  }
  return landing;
}
