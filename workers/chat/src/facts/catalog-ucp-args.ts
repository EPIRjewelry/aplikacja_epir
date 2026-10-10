import type {CatalogFilters} from './types';
import {moneyFromMinor} from './types';

export const CATALOG_SEARCH_SERVER_LIMIT = 10;

function priceMinor(v: CatalogFilters['priceMin']): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v.minor ?? v.amount_minor;
}

/** Argumenty MCP search_catalog — waluta i limit wymuszane po stronie serwera. */
export function buildUcpSearchCatalogArgs(
  filters: CatalogFilters,
  limit: number = CATALOG_SEARCH_SERVER_LIMIT,
): {catalog: Record<string, unknown>} {
  const query = filters.text?.trim() || '';
  const intent = filters.ucpIntent?.trim() || 'purchase';
  const catalog: Record<string, unknown> = {
    query,
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
  if (min !== undefined || max !== undefined) {
    const price: Record<string, number> = {};
    if (min !== undefined) price.min = min;
    if (max !== undefined) price.max = max;
    catalog.filters = {price};
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
