import type {CommerceContext} from '../config/commerce-context';
import {mergeCatalogCommerceContext} from '../config/commerce-context';
import {
  isKazkaCatalogBrand,
  KAZKA_CATALOG_SEARCH_CANDIDATES,
} from './kazka-assortment';
import {buildUcpAgentMeta, ensureUcpAgentMeta} from './ucp-agent-meta';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export type CatalogImageSearchInput = {
  query?: string;
  image_base64?: string;
  image_content_type?: string;
  reference_id?: string;
};

/** Shopify Storefront Catalog accepts only taxonomy GIDs in `filters.categories`. */
const TAXONOMY_CATEGORY_GID = /^gid:\/\/shopify\/TaxonomyCategory\/\S+$/i;
/**
 * UCP `filters.price` is minor units (grosze). Slim tool schema dropped that hint,
 * so a buyer budget „≤ 5000 zł” leaves the model as `max: 5000` (= 50 zł) and
 * every real ring drops out. Values below 100 zł-in-minor (10000) are złoty.
 * 500000 (already 5000 zł in grosze) stays put.
 */
const PLN_PRICE_FILTER_MAJOR_CEILING = 10000;

function readCurrency(catalog: Record<string, unknown>): string {
  const context = catalog.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return '';
  const currency = (context as Record<string, unknown>).currency;
  return typeof currency === 'string' ? currency.trim().toUpperCase() : '';
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Makes UCP catalog filters match the Storefront Catalog schema:
 * drop non-GID categories (they AND-exclude the whole result set) and
 * rescale PLN budgets that were sent in złoty.
 */
export function sanitizeUcpCatalogFilters(catalog: Record<string, unknown>): void {
  const filtersRaw = catalog.filters;
  if (!filtersRaw || typeof filtersRaw !== 'object' || Array.isArray(filtersRaw)) return;
  const filters = {...(filtersRaw as Record<string, unknown>)};

  const categoriesRaw = filters.categories;
  const categoryList = Array.isArray(categoriesRaw)
    ? categoriesRaw
    : typeof categoriesRaw === 'string'
      ? [categoriesRaw]
      : null;
  if (categoryList) {
    const gids = categoryList
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => TAXONOMY_CATEGORY_GID.test(item));
    if (gids.length > 0) filters.categories = gids;
    else delete filters.categories;
  }

  const currency = readCurrency(catalog);
  const priceRaw = filters.price;
  if (priceRaw && typeof priceRaw === 'object' && !Array.isArray(priceRaw) && currency === 'PLN') {
    const price = {...(priceRaw as Record<string, unknown>)};
    for (const key of ['min', 'max'] as const) {
      const amount = positiveNumber(price[key]);
      if (amount !== null && amount < PLN_PRICE_FILTER_MAJOR_CEILING) {
        price[key] = Math.round(amount * 100);
      } else if (amount !== null) {
        price[key] = amount;
      }
    }
    filters.price = price;
  }

  if (Object.keys(filters).length === 0) delete catalog.filters;
  else catalog.filters = filters;
}

/**
 * Normalizuje argumenty catalog_search (UCP search_catalog na /api/ucp/mcp).
 */
export function normalizeCatalogSearchArgs(
  raw: unknown,
  env: {UCP_AGENT_PROFILE_URL?: string; WORKER_ORIGIN?: string},
  commerce?: CommerceContext,
  brand?: string,
): Record<string, unknown> {
  const source = raw && typeof raw === 'object' ? {...(raw as Record<string, unknown>)} : {};
  const catalog =
    source.catalog && typeof source.catalog === 'object'
      ? {...(source.catalog as Record<string, unknown>)}
      : {};

  const legacyQuery = isNonEmptyString(source.query) ? source.query.trim() : '';
  if (!isNonEmptyString(catalog.query) && legacyQuery) {
    catalog.query = legacyQuery;
  }
  if (isNonEmptyString(catalog.query)) {
    catalog.query = catalog.query.trim();
  }

  const context =
    catalog.context && typeof catalog.context === 'object'
      ? {...(catalog.context as Record<string, unknown>)}
      : {};
  if (!isNonEmptyString(context.intent)) {
    context.intent = 'biżuteria';
  }
  if (brand === 'zareczyny' && isNonEmptyString(context.intent)) {
    context.intent = `${context.intent} w kontekście pierścionków zaręczynowych`;
  }
  if (commerce) {
    catalog.context = mergeCatalogCommerceContext(context, commerce);
  } else {
    catalog.context = context;
  }

  const pagination =
    catalog.pagination && typeof catalog.pagination === 'object'
      ? {...(catalog.pagination as Record<string, unknown>)}
      : {};
  const limitRaw = pagination.limit ?? source.limit ?? source.first ?? 3;
  const limitNum = typeof limitRaw === 'number' ? Math.trunc(limitRaw) : 3;
  pagination.limit = isKazkaCatalogBrand(brand)
    ? KAZKA_CATALOG_SEARCH_CANDIDATES
    : Math.max(1, Math.min(limitNum, 10));
  catalog.pagination = pagination;
  sanitizeUcpCatalogFilters(catalog);

  return ensureUcpAgentMeta(
    {
      ...buildUcpAgentMeta(env),
      catalog,
    },
    env,
  );
}

/**
 * Batch lookup — do 10 identyfikatorów (Storefront Catalog MCP).
 */
export function normalizeCatalogLookupArgs(
  raw: unknown,
  env: {UCP_AGENT_PROFILE_URL?: string; WORKER_ORIGIN?: string},
  commerce?: CommerceContext,
): Record<string, unknown> {
  const source = raw && typeof raw === 'object' ? {...(raw as Record<string, unknown>)} : {};
  const catalog =
    source.catalog && typeof source.catalog === 'object'
      ? {...(source.catalog as Record<string, unknown>)}
      : {};

  let ids: string[] = [];
  if (Array.isArray(catalog.ids)) {
    ids = catalog.ids.filter((id): id is string => isNonEmptyString(id)).map((id) => id.trim());
  } else if (Array.isArray(source.ids)) {
    ids = source.ids.filter((id): id is string => isNonEmptyString(id)).map((id) => id.trim());
  } else if (isNonEmptyString(source.id)) {
    ids = [source.id.trim()];
  }
  catalog.ids = ids.slice(0, 10);

  const context =
    catalog.context && typeof catalog.context === 'object'
      ? {...(catalog.context as Record<string, unknown>)}
      : {};
  if (commerce) {
    catalog.context = mergeCatalogCommerceContext(context, commerce);
  }

  return {
    ...buildUcpAgentMeta(env),
    catalog,
  };
}

/**
 * Multimodal / visual similarity — catalog.like + opcjonalny query.
 */
export function normalizeCatalogImageSearchArgs(
  raw: unknown,
  env: {UCP_AGENT_PROFILE_URL?: string; WORKER_ORIGIN?: string},
  commerce?: CommerceContext,
  brand?: string,
): Record<string, unknown> {
  const base = normalizeCatalogSearchArgs(raw, env, commerce, brand);
  const catalog = (base.catalog ?? {}) as Record<string, unknown>;
  const source = raw && typeof raw === 'object' ? (raw as CatalogImageSearchInput) : {};

  const contentType = source.image_content_type?.trim() || 'image/jpeg';
  const imageData = source.image_base64?.trim();
  const referenceId = source.reference_id?.trim();

  if (imageData) {
    catalog.like = {
      image: {
        content_type: contentType,
        data: imageData,
      },
    };
  } else if (referenceId) {
    catalog.like = {id: referenceId};
  }

  return {...base, catalog};
}
