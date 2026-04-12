import type { Env } from './config/bindings';
import { callStorefrontAPI } from './graphql';
import { resolveStorefrontConfig } from './config/storefronts';

interface MetaobjectFieldNode {
  key?: string | null;
  value?: string | null;
}

interface MetaobjectNode {
  fields?: MetaobjectFieldNode[] | null;
}

interface SizeTableByIdResponse {
  metaobject?: MetaobjectNode | null;
}

interface SizeTableByHandleResponse {
  metaobject?: MetaobjectNode | null;
}

interface SizeTableListResponse {
  metaobjects?: {
    nodes?: Array<MetaobjectNode | null> | null;
  } | null;
}

const SIZE_TABLE_BY_ID = `
  query GetRingSizeTableById($id: ID!) {
    metaobject(id: $id) {
      fields {
        key
        value
      }
    }
  }
`;

const SIZE_TABLE_BY_HANDLE = `
  query GetRingSizeTable {
    metaobject(handle: { handle: "tabela_rozmiarow", type: "tabela_rozmiarow" }) {
      fields {
        key
        value
      }
    }
  }
`;

const SIZE_TABLE_LIST = `
  query ListRingSizeTables {
    metaobjects(first: 8, type: "tabela_rozmiarow") {
      nodes {
        fields {
          key
          value
        }
      }
    }
  }
`;

/** Preferowane klucze pola w metaobject (Custom Data). */
const PREFERRED_FIELD_KEYS = ['table_content', 'tresc_tabeli', 'content', 'tabela', 'tekst'];

/**
 * Uwaga operacyjna: metaobject `tabela_rozmiarow` musi być Active,
 * inaczej Storefront API zwróci `null` mimo poprawnego handle/type.
 */
const SIZE_TABLE_FALLBACK_TEXT =
  'Aktualna tabela rozmiarów pierścionków jest chwilowo niedostępna. Nie zgaduj przeliczenia — zaproponuj klientowi ponowną próbę za chwilę albo kontakt z pracownią, jeśli potrzebuje pilnej pomocy.';

function getLegacyStorefrontTokenChain(env: Env): string | undefined {
  return (
    env.SHOPIFY_STOREFRONT_TOKEN
    ?? env.PRIVATE_STOREFRONT_API_TOKEN
    ?? env.PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY
    ?? env.PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY
    ?? env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA
  );
}

/**
 * Ten sam priorytet co przy odczycie `ai_profile`: private → public kanału.
 * Bez tego przy ustawionym SHOPIFY_STOREFRONT_TOKEN mogliśmy brać zły token względem kanału Hydrogen.
 */
function resolveStorefrontTokenForSizeTable(env: Env, brand?: string): string | undefined {
  const cfg = brand ? resolveStorefrontConfig(env, brand) : null;
  if (cfg) {
    const channelToken = cfg.privateToken ?? cfg.apiToken;
    if (channelToken?.trim()) return channelToken.trim();
  }
  return getLegacyStorefrontTokenChain(env);
}

/** Wyciąga tekst z ewentualnego JSON rich text (Shopify). */
function extractPlainTextFromMaybeRich(value: string): string {
  const t = value.trim();
  if (!t.startsWith('{')) return t;
  try {
    const o = JSON.parse(t) as unknown;
    const texts: string[] = [];
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      const r = n as Record<string, unknown>;
      if (r.type === 'text' && typeof r.value === 'string') texts.push(r.value);
      if (Array.isArray(r.children)) (r.children as unknown[]).forEach(walk);
      if (Array.isArray(n)) (n as unknown[]).forEach(walk);
    };
    walk(o);
    const joined = texts.join('\n').trim();
    return joined.length > 0 ? joined : t;
  } catch {
    return t;
  }
}

function extractSizeTableContent(fields: MetaobjectFieldNode[] | null | undefined): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;

  for (const key of PREFERRED_FIELD_KEYS) {
    const field = fields.find((item) => item?.key === key);
    const raw = typeof field?.value === 'string' ? field.value : '';
    const normalized = extractPlainTextFromMaybeRich(raw).trim();
    if (normalized.length > 0) return normalized;
  }

  let best: string | null = null;
  for (const item of fields) {
    const raw = typeof item?.value === 'string' ? item.value : '';
    const normalized = extractPlainTextFromMaybeRich(raw).trim();
    if (normalized.length < 20) continue;
    if (/rozmiar|mm|średnic|obwód|EU|PL|UK|US/i.test(normalized)) {
      return normalized;
    }
    if (!best || normalized.length > best.length) best = normalized;
  }

  return best;
}

export async function getSizeTable(env: Env, brand?: string): Promise<{ content: string; source: 'shopify_metaobject' | 'fallback' }> {
  const shopDomain = env.SHOP_DOMAIN;
  const storefrontToken = resolveStorefrontTokenForSizeTable(env, brand);

  if (!shopDomain || !storefrontToken) {
    console.warn('[size-table] missing Storefront API configuration', {
      hasShopDomain: Boolean(shopDomain),
      hasStorefrontToken: Boolean(storefrontToken),
      brand: brand ?? null,
    });
    return {
      content: SIZE_TABLE_FALLBACK_TEXT,
      source: 'fallback',
    };
  }

  const gidOverride = typeof env.SIZE_TABLE_METAOBJECT_GID === 'string' ? env.SIZE_TABLE_METAOBJECT_GID.trim() : '';

  try {
    if (gidOverride) {
      const byId = await callStorefrontAPI<SizeTableByIdResponse>(
        shopDomain,
        storefrontToken,
        SIZE_TABLE_BY_ID,
        { id: gidOverride },
      );
      const content = extractSizeTableContent(byId.metaobject?.fields);
      if (content) {
        return { content, source: 'shopify_metaobject' };
      }
      console.warn('[size-table] GID override set but metaobject empty or unreadable', { gid: gidOverride });
    }

    const byHandle = await callStorefrontAPI<SizeTableByHandleResponse>(shopDomain, storefrontToken, SIZE_TABLE_BY_HANDLE);
    let content = extractSizeTableContent(byHandle.metaobject?.fields);
    if (content) {
      return { content, source: 'shopify_metaobject' };
    }

    try {
      const listed = await callStorefrontAPI<SizeTableListResponse>(shopDomain, storefrontToken, SIZE_TABLE_LIST);
      const nodes = listed.metaobjects?.nodes ?? [];
      for (const node of nodes) {
        if (!node) continue;
        content = extractSizeTableContent(node.fields);
        if (content) {
          return { content, source: 'shopify_metaobject' };
        }
      }
    } catch (listErr) {
      console.warn('[size-table] metaobjects list fallback failed', listErr);
    }

    console.warn('[size-table] metaobject missing or no readable field', {
      handle: 'tabela_rozmiarow',
      type: 'tabela_rozmiarow',
      brand: brand ?? null,
    });
    return {
      content: SIZE_TABLE_FALLBACK_TEXT,
      source: 'fallback',
    };
  } catch (error) {
    console.warn('[size-table] Storefront API fetch failed', error);
    return {
      content: SIZE_TABLE_FALLBACK_TEXT,
      source: 'fallback',
    };
  }
}
