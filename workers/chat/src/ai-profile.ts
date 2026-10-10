import type { BuyerChannelId } from './buyer/channel-switch';
import type { Env } from './config/bindings';
import { resolveStorefrontConfig } from './config/storefronts';
import { buildStorefrontAuthHeaders, callStorefrontAPI, type CallStorefrontAPIOptions } from './graphql';

export interface AIProfile {
  brand_voice: string;
  core_values: string;
  promotion_rules: string;
  /** Legacy field; not included in buyer Gemma prompt (policies via MCP). */
  faq_theme?: string;
}

interface MetaobjectFieldNode {
  key?: string | null;
  value?: string | null;
}

interface AIProfileByIdQueryResponse {
  metaobject?: {
    fields?: MetaobjectFieldNode[] | null;
  } | null;
}

interface AIProfileByHandleQueryResponse {
  metaobject?: {
    fields?: MetaobjectFieldNode[] | null;
  } | null;
}

/** Buyer channel → metaobject handle (`type: ai_profile`). */
export const AI_PROFILE_HANDLE_BY_BUYER_CHANNEL: Record<BuyerChannelId, string> = {
  'epir-online-store': 'online-store',
  'kazka-hydrogen': 'kazka',
  'epir-zareczyny': 'zareczyny',
};

const AI_PROFILE_TYPE = 'ai_profile';
const AI_PROFILE_TTL_MS = 5 * 60_000;
const aiProfileCache = new Map<string, { expiresAt: number; profile: AIProfile | null }>();

const AI_PROFILE_BY_ID_QUERY = `
  query getAIProfile($id: ID!) {
    metaobject(id: $id) {
      fields {
        key
        value
      }
    }
  }
`;

const AI_PROFILE_BY_HANDLE_QUERY = `
  query getAIProfileByHandle($handle: String!) {
    metaobject(handle: { type: "${AI_PROFILE_TYPE}", handle: $handle }) {
      fields {
        key
        value
      }
    }
  }
`;

function normalizeStorefrontIdField(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function normalizeAIProfile(
  fields: MetaobjectFieldNode[] | null | undefined,
  expectedStorefrontId?: string,
): AIProfile | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;

  const values = new Map<string, string>();
  for (const field of fields) {
    if (!field?.key) continue;
    values.set(field.key, typeof field.value === 'string' ? field.value.trim() : '');
  }

  if (expectedStorefrontId) {
    const sf = normalizeStorefrontIdField(values.get('storefront_id'));
    const expected = normalizeStorefrontIdField(expectedStorefrontId);
    if (!sf || sf !== expected) {
      console.warn('[ai-profile] storefront_id mismatch', {
        expected: expectedStorefrontId,
        actual: values.get('storefront_id') ?? null,
      });
      return null;
    }
  }

  const faqTheme = values.get('faq_theme') ?? '';
  const profile: AIProfile = {
    brand_voice: values.get('brand_voice') ?? '',
    core_values: values.get('core_values') ?? '',
    promotion_rules: values.get('promotion_rules') ?? '',
    ...(faqTheme ? { faq_theme: faqTheme } : {}),
  };

  if (
    !profile.brand_voice &&
    !profile.core_values &&
    !profile.promotion_rules
  ) {
    return null;
  }

  return profile;
}

type ResolvedStorefrontAuth = {
  token: string;
  options: CallStorefrontAPIOptions;
};

function resolveStorefrontAuthForBrand(env: Env, brandKey: string): ResolvedStorefrontAuth | null {
  if (brandKey === 'kazka') {
    const kazkaPrivate = env.PRIVATE_STOREFRONT_API_TOKEN_KAZKA?.trim();
    if (kazkaPrivate) {
      return { token: kazkaPrivate, options: { tokenKind: 'private' } };
    }
  }
  const cfg = resolveStorefrontConfig(env, brandKey);
  if (!cfg) return null;
  const privateToken = cfg.privateToken?.trim();
  if (privateToken) {
    return { token: privateToken, options: { tokenKind: 'private' } };
  }
  const publicToken = cfg.apiToken?.trim();
  if (publicToken) {
    return { token: publicToken, options: { tokenKind: 'public' } };
  }
  return null;
}

function brandKeyForBuyerChannel(channelId: BuyerChannelId): string {
  if (channelId === 'kazka-hydrogen') return 'kazka';
  if (channelId === 'epir-zareczyny') return 'zareczyny';
  return 'online-store';
}

function cacheGet(key: string): AIProfile | null | undefined {
  const cached = aiProfileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    console.log('[ai-profile] cache hit', { cacheKey: key });
    return cached.profile;
  }
  return undefined;
}

function cacheSet(key: string, profile: AIProfile | null): void {
  aiProfileCache.set(key, { expiresAt: Date.now() + AI_PROFILE_TTL_MS, profile });
}

/** Legacy GID fetch (operator / streamAssistant) — prefer handle API for buyer path. */
export async function fetchAIProfile(
  gid: string | undefined,
  storefrontApiToken: string | undefined,
  shopDomain: string | undefined,
  callOptions?: CallStorefrontAPIOptions,
): Promise<AIProfile | null> {
  if (!gid || !storefrontApiToken || !shopDomain) {
    console.warn('[ai-profile] unavailable (pre-flight)', {
      hasGid: Boolean(gid),
      hasStorefrontToken: Boolean(storefrontApiToken),
      hasShopDomain: Boolean(shopDomain),
    });
    return null;
  }

  const cacheKey = `${shopDomain}:gid:${gid}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit;

  try {
    console.log('[ai-profile] fetch by gid', { gid, cacheKey });
    const data = await callStorefrontAPI<AIProfileByIdQueryResponse>(
      shopDomain,
      storefrontApiToken,
      AI_PROFILE_BY_ID_QUERY,
      { id: gid },
      callOptions,
    );
    const profile = normalizeAIProfile(data.metaobject?.fields);

    if (!data.metaobject) {
      console.warn('[ai-profile] metaobject not found', { gid });
    } else {
      console.log('[ai-profile] fetch result', { gid, loaded: Boolean(profile) });
    }

    cacheSet(cacheKey, profile);
    return profile;
  } catch (error) {
    console.warn(`[ai-profile] Failed to fetch AI profile for gid: ${gid}`, error);
    return null;
  }
}

export async function fetchAIProfileByHandle(
  env: Env,
  channelId: BuyerChannelId,
  buyerIp?: string,
): Promise<AIProfile | null> {
  const shopDomain = env.SHOP_DOMAIN?.trim();
  const handle = AI_PROFILE_HANDLE_BY_BUYER_CHANNEL[channelId];
  const brandKey = brandKeyForBuyerChannel(channelId);
  const auth = resolveStorefrontAuthForBrand(env, brandKey);

  if (!shopDomain || !handle || !auth) {
    console.warn('[ai-profile] unavailable (pre-flight handle)', {
      channelId,
      handle,
      hasShopDomain: Boolean(shopDomain),
      hasAuth: Boolean(auth),
    });
    return null;
  }

  const callOptions: CallStorefrontAPIOptions = {
    ...auth.options,
    buyerIp: auth.options.tokenKind === 'private' ? buyerIp : undefined,
  };

  const cacheKey = `${shopDomain}:handle:${handle}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit;

  try {
    console.log('[ai-profile] fetch by handle', { channelId, handle, cacheKey });
    const data = await callStorefrontAPI<AIProfileByHandleQueryResponse>(
      shopDomain,
      auth.token,
      AI_PROFILE_BY_HANDLE_QUERY,
      { handle },
      callOptions,
    );
    const profile = normalizeAIProfile(data.metaobject?.fields, handle);

    if (!data.metaobject) {
      console.warn('[ai-profile] metaobject not found', { handle, channelId });
    } else {
      console.log('[ai-profile] fetch result', { handle, channelId, loaded: Boolean(profile) });
    }

    cacheSet(cacheKey, profile);
    return profile;
  } catch (error) {
    console.warn(`[ai-profile] Failed to fetch AI profile for handle: ${handle}`, error);
    return null;
  }
}

export function buildAIProfilePrompt(profile: AIProfile): string {
  const sections = [
    profile.brand_voice && `Głos marki: ${profile.brand_voice}`,
    profile.core_values && `Wartości: ${profile.core_values}`,
    profile.promotion_rules && `Komunikacja korzyści: ${profile.promotion_rules}`,
  ].filter((value): value is string => value.trim().length > 0);

  return ['Profil marki i styl rozmowy:', ...sections.map((value) => `- ${value}`)].join('\n');
}

/** Invalidate cached profiles for a metaobject handle (webhooks, stage G). */
export function invalidateAIProfileCacheForHandle(shopDomain: string, handle: string): void {
  const key = `${shopDomain.trim()}:handle:${handle.trim()}`;
  aiProfileCache.delete(key);
}

export function clearAIProfileCache(): void {
  aiProfileCache.clear();
}

/** @internal tests */
export function _buildStorefrontAuthHeadersForTest(
  token: string,
  options?: CallStorefrontAPIOptions,
): Record<string, string> {
  return buildStorefrontAuthHeaders(token, options);
}
