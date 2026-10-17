import type {CatalogFilters} from './types';
import {moneyFromMinor} from './types';

export const CATALOG_SEARCH_SERVER_LIMIT = 10;

/**
 * Browse bez `catalog.query` — wymaga filtra (UCP + MCP walidacja).
 * Filtr `available: true` — rozszerzenie dev.shopify.catalog (profil agenta:
 * workers/chat/src/catalog/ucp-agent-profile.ts:58-61); typ `available` w
 * workers/chat/src/facts/types.ts:98-99.
 */
export type BuildUcpSearchCatalogOptions = {
  browseInStockAvailable?: boolean;
};

function priceMinor(v: CatalogFilters['priceMin']): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v.minor ?? v.amount_minor;
}

/** Argumenty MCP search_catalog — waluta i limit wymuszane po stronie serwera. */
export function buildUcpSearchCatalogArgs(
  filters: CatalogFilters,
  limit: number = CATALOG_SEARCH_SERVER_LIMIT,
  buildOptions?: BuildUcpSearchCatalogOptions,
): {catalog: Record<string, unknown>} {
  const intent = filters.ucpIntent?.trim() || 'purchase';
  const catalog: Record<string, unknown> = {
    pagination: {limit},
    context: {
      address_country: 'PL',
      language: 'pl',
      currency: 'PLN',
      intent,
    },
  };

  const min = priceMinor(filters.priceMin);
  const max = priceMinor(filters.priceMax);
  const priceFilter =
    min !== undefined || max !== undefined
      ? {
          price: {
            ...(min !== undefined ? {min} : {}),
            ...(max !== undefined ? {max} : {}),
          },
        }
      : undefined;

  if (buildOptions?.browseInStockAvailable) {
    catalog.filters = {available: true, ...priceFilter};
    return {catalog};
  }

  catalog.query = filters.text?.trim() || '';
  if (priceFilter) {
    catalog.filters = priceFilter;
  }
  return {catalog};
}

export function plnWholeToMinor(pln: number): number {
  return moneyFromMinor(pln * 100).minor;
}

export function parseUcpFilterIgnoredMessages(mcpOut: unknown): string[] {
  const wrapped = mcpOut as {
    result?: {content?: Array<{text?: string}>};
  };
  const text = wrapped.result?.content?.[0]?.text;
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as {
      messages?: Array<{message?: string; type?: string}>;
      catalog?: {messages?: Array<{message?: string}>};
    };
    const raw =
      (Array.isArray(parsed.messages) && parsed.messages) ||
      (Array.isArray(parsed.catalog?.messages) && parsed.catalog.messages) ||
      [];
    const out: string[] = [];
    for (const m of raw) {
      const msg = typeof m?.message === 'string' ? m.message.trim() : '';
      if (!msg) continue;
      if (/filter|ignored|price/i.test(msg)) out.push(msg);
    }
    return out;
  } catch {
    return [];
  }
}
