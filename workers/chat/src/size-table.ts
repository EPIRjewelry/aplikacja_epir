import type { Env } from './config/bindings';
import { callStorefrontAPI } from './graphql';

interface MetaobjectFieldNode {
  key?: string | null;
  value?: string | null;
}

interface SizeTableQueryResponse {
  metaobject?: {
    fields?: MetaobjectFieldNode[] | null;
  } | null;
}

const SIZE_TABLE_QUERY = `
  query GetRingSizeTable {
    metaobject(handle: { handle: "tabela_rozmiarow", type: "tabela_rozmiarow" }) {
      fields {
        key
        value
      }
    }
  }
`;

const SIZE_TABLE_FIELD_KEY = 'table_content';

/**
 * Uwaga operacyjna: metaobject `tabela_rozmiarow/tabela_rozmiarow` musi być Active,
 * inaczej Storefront API zwróci `null` mimo poprawnego handle/type.
 */
const SIZE_TABLE_FALLBACK_TEXT =
  'Aktualna tabela rozmiarów pierścionków jest chwilowo niedostępna. Nie zgaduj przeliczenia — zaproponuj klientowi ponowną próbę za chwilę albo kontakt z pracownią, jeśli potrzebuje pilnej pomocy.';

function getStorefrontToken(env: Env): string | undefined {
  return (
    env.SHOPIFY_STOREFRONT_TOKEN
    ?? env.PRIVATE_STOREFRONT_API_TOKEN
    ?? env.PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY
    ?? env.PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY
    ?? env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA
  );
}

function extractSizeTableContent(fields: MetaobjectFieldNode[] | null | undefined): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const field = fields.find((item) => item?.key === SIZE_TABLE_FIELD_KEY);
  const value = typeof field?.value === 'string' ? field.value.trim() : '';
  return value.length > 0 ? value : null;
}

export async function getSizeTable(env: Env): Promise<{ content: string; source: 'shopify_metaobject' | 'fallback' }> {
  const shopDomain = env.SHOP_DOMAIN;
  const storefrontToken = getStorefrontToken(env);

  if (!shopDomain || !storefrontToken) {
    console.warn('[size-table] missing Storefront API configuration', {
      hasShopDomain: Boolean(shopDomain),
      hasStorefrontToken: Boolean(storefrontToken),
    });
    return {
      content: SIZE_TABLE_FALLBACK_TEXT,
      source: 'fallback',
    };
  }

  try {
    const data = await callStorefrontAPI<SizeTableQueryResponse>(shopDomain, storefrontToken, SIZE_TABLE_QUERY);
    const content = extractSizeTableContent(data.metaobject?.fields);

    if (!content) {
      console.warn('[size-table] metaobject missing or empty field', {
        handle: 'tabela_rozmiarow',
        type: 'tabela_rozmiarow',
        fieldKey: SIZE_TABLE_FIELD_KEY,
      });
      return {
        content: SIZE_TABLE_FALLBACK_TEXT,
        source: 'fallback',
      };
    }

    return {
      content,
      source: 'shopify_metaobject',
    };
  } catch (error) {
    console.warn('[size-table] Storefront API fetch failed', error);
    return {
      content: SIZE_TABLE_FALLBACK_TEXT,
      source: 'fallback',
    };
  }
}