import { callStorefrontAPI } from './graphql';

export interface AIProfile {
  brand_voice: string;
  core_values: string;
  faq_theme: string;
  promotion_rules: string;
}

const SIZE_TABLE_PROMPT_INSTRUCTION =
  'Size Table Tool: Gdy klient pyta o rozmiar pierścionka lub jak zmierzyć palec – użyj narzędzia get_size_table aby pobrać aktualną tabelę rozmiarów.';

interface MetaobjectFieldNode {
  key?: string | null;
  value?: string | null;
}

interface AIProfileQueryResponse {
  metaobject?: {
    fields?: MetaobjectFieldNode[] | null;
  } | null;
}

const AI_PROFILE_TTL_MS = 5 * 60_000;
const aiProfileCache = new Map<string, { expiresAt: number; profile: AIProfile | null }>();

const AI_PROFILE_QUERY = `
  query getAIProfile($id: ID!) {
    metaobject(id: $id) {
      fields {
        key
        value
      }
    }
  }
`;

function normalizeAIProfile(fields: MetaobjectFieldNode[] | null | undefined): AIProfile | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;

  const values = new Map<string, string>();
  for (const field of fields) {
    if (!field?.key) continue;
    values.set(field.key, typeof field.value === 'string' ? field.value.trim() : '');
  }

  const profile: AIProfile = {
    brand_voice: values.get('brand_voice') ?? '',
    core_values: values.get('core_values') ?? '',
    faq_theme: values.get('faq_theme') ?? '',
    promotion_rules: values.get('promotion_rules') ?? '',
  };

  if (Object.values(profile).every((value) => value.length === 0)) {
    return null;
  }

  return profile;
}

export async function fetchAIProfile(
  gid: string | undefined,
  storefrontApiToken: string | undefined,
  shopDomain: string | undefined
): Promise<AIProfile | null> {
  if (!gid || !storefrontApiToken || !shopDomain) {
    console.warn('[ai-profile] unavailable (pre-flight)', {
      hasGid: Boolean(gid),
      hasStorefrontToken: Boolean(storefrontApiToken),
      hasShopDomain: Boolean(shopDomain),
    });
    return null;
  }

  const cacheKey = `${shopDomain}:${gid}`;
  const cached = aiProfileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  try {
    console.log('[ai-profile] resolved GID:', gid);
    console.log('[ai-profile] token (8 chars):', storefrontApiToken?.slice(0, 8));
    const data = await callStorefrontAPI<AIProfileQueryResponse>(shopDomain, storefrontApiToken, AI_PROFILE_QUERY, { id: gid });
    console.log('[ai-profile] metaobject result:', JSON.stringify(data?.metaobject));
    const profile = normalizeAIProfile(data.metaobject?.fields);

    if (!data.metaobject) {
      console.warn(`[ai-profile] Metaobject not found for gid: ${gid}`);
    }

    aiProfileCache.set(cacheKey, { expiresAt: Date.now() + AI_PROFILE_TTL_MS, profile });
    return profile;
  } catch (error) {
    console.warn(`[ai-profile] Failed to fetch AI profile for gid: ${gid}`, error);
    return null;
  }
}

export function buildAIProfilePrompt(profile: AIProfile): string {
  return [
    `Brand Voice: ${profile.brand_voice}`,
    `Core Values: ${profile.core_values}`,
    `FAQ Focus: ${profile.faq_theme}`,
    `Active Promotions: ${profile.promotion_rules}`,
    SIZE_TABLE_PROMPT_INSTRUCTION,
  ].join('\n');
}

export function clearAIProfileCache(): void {
  aiProfileCache.clear();
}