import type {CommerceContext} from '../config/commerce-context';
import {mergeCatalogCommerceContext} from '../config/commerce-context';
import {buildUcpAgentMeta} from './ucp-agent-meta';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export type CatalogImageSearchInput = {
  query?: string;
  image_base64?: string;
  image_content_type?: string;
  reference_id?: string;
};

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
  pagination.limit = Math.max(1, Math.min(limitNum, 10));
  catalog.pagination = pagination;

  return {
    ...buildUcpAgentMeta(env),
    catalog,
  };
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
