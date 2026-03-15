import { callStorefrontAPI } from './graphql';

export interface AIProfile {
  brand_voice: string;
  core_values: string;
  faq_theme: string;
  promotion_rules: string;
}

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
    return null;
  }

  const cacheKey = `${shopDomain}:${gid}`;
  const cached = aiProfileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  try {
    const data = await callStorefrontAPI<AIProfileQueryResponse>(shopDomain, storefrontApiToken, AI_PROFILE_QUERY, { id: gid });
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
  ].join('\n');
}

export function clearAIProfileCache(): void {
  aiProfileCache.clear();
}