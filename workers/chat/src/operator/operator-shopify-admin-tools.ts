/**
 * Operator Shopify Admin — whitelist presetów GraphQL (odczyt).
 * Używa istniejącego SHOPIFY_ADMIN_TOKEN — bez nowych sekretów.
 */
import type { Env } from '../config/bindings';
import { callAdminAPI } from '../graphql';

export type OperatorShopifyAdminPresetId =
  | 'A1_PRODUCTS_RECENT'
  | 'A2_COLLECTIONS_LIST'
  | 'A3_BLOG_ARTICLES_RECENT'
  | 'A4_PAGES_LIST';

type PresetDef = {
  readonly id: OperatorShopifyAdminPresetId;
  readonly query: string;
  readonly variables?: Record<string, unknown>;
};

const PRESETS: readonly PresetDef[] = [
  {
    id: 'A1_PRODUCTS_RECENT',
    query: `query OpProducts {
      products(first: 15, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title status updatedAt totalInventory }
      }
    }`,
  },
  {
    id: 'A2_COLLECTIONS_LIST',
    query: `query OpCollections {
      collections(first: 20, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title handle updatedAt productsCount { count } }
      }
    }`,
  },
  {
    id: 'A3_BLOG_ARTICLES_RECENT',
    query: `query OpArticles {
      articles(first: 15, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title handle blog { title } updatedAt publishedAt }
      }
    }`,
  },
  {
    id: 'A4_PAGES_LIST',
    query: `query OpPages {
      pages(first: 20, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title handle updatedAt publishedAt }
      }
    }`,
  },
];

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export function isOperatorShopifyAdminPresetId(v: string): v is OperatorShopifyAdminPresetId {
  return PRESET_BY_ID.has(v as OperatorShopifyAdminPresetId);
}

export async function runOperatorShopifyAdminRead(
  env: Env,
  presetId: string,
): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  const adminToken = (env.SHOPIFY_ADMIN_TOKEN ?? '').trim();
  if (!adminToken || !env.SHOP_DOMAIN?.trim()) {
    return {
      error: {
        code: -32000,
        message: 'operator_shopify_admin_read requires SHOP_DOMAIN and SHOPIFY_ADMIN_TOKEN',
      },
    };
  }
  if (!isOperatorShopifyAdminPresetId(presetId)) {
    return {
      error: {
        code: -32602,
        message: `Invalid presetId. Allowed: ${PRESETS.map((p) => p.id).join(', ')}`,
      },
    };
  }
  const preset = PRESET_BY_ID.get(presetId)!;
  try {
    const data = await callAdminAPI(
      env.SHOP_DOMAIN.trim(),
      adminToken,
      preset.query,
      preset.variables ?? {},
    );
    return {
      result: {
        source: 'shopify_admin_read',
        presetId,
        data,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: { code: -32000, message: msg } };
  }
}
