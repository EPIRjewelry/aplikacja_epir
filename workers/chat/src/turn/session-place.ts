/**
 * Miejsce kupującego z piksela tej sesji czatu (ten sam session_id co cookie _epir_session_id).
 * Nie otwiera czatu i nie składa zestawu — tylko URL i produkt, jeśli wiersz jest.
 */

import { parseStorefrontPathContext } from '../storefront/path-context';

export type SessionPixelPlace = {
  pageUrl: string | null;
  productTitle: string | null;
  productHandle: string | null;
};

type PixelPlaceRow = {
  page_url?: string | null;
  page_title?: string | null;
  product_title?: string | null;
};

function clean(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function pickSessionPixelPlace(rows: PixelPlaceRow[]): SessionPixelPlace | null {
  const withProduct = rows.find((row) => clean(row.product_title) || productHandleFromUrl(row.page_url));
  const withUrl = rows.find((row) => clean(row.page_url));
  const chosen = withProduct ?? withUrl;
  if (!chosen) return null;
  const pageUrl = clean(chosen.page_url, 400);
  const productTitle = clean(chosen.product_title) ?? clean(chosen.page_title);
  const productHandle = productHandleFromUrl(pageUrl);
  if (!pageUrl && !productTitle && !productHandle) return null;
  return { pageUrl, productTitle, productHandle };
}

function productHandleFromUrl(pageUrl: unknown): string | null {
  const url = clean(pageUrl, 400);
  if (!url) return null;
  try {
    const pathname = url.startsWith('http') ? new URL(url).pathname : url;
    return parseStorefrontPathContext(pathname).productHandle ?? null;
  } catch {
    return parseStorefrontPathContext(url).productHandle ?? null;
  }
}

export function formatSessionPixelPlace(place: SessionPixelPlace): string | null {
  const bits: string[] = [];
  if (place.pageUrl) bits.push(place.pageUrl);
  if (place.productTitle) bits.push(place.productTitle);
  else if (place.productHandle) bits.push(place.productHandle);
  if (bits.length === 0) return null;
  return `Gdzie jest kupujący (piksel tej sesji): ${bits.join(' — ')}`;
}

export async function loadSessionPixelPlace(
  db: D1Database | undefined,
  sessionId: string | null | undefined,
): Promise<SessionPixelPlace | null> {
  const sid = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!db || !sid) return null;
  try {
    const result = await db
      .prepare(
        `SELECT page_url, page_title, product_title
         FROM pixel_events
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT 8`,
      )
      .bind(sid)
      .all<PixelPlaceRow>();
    return pickSessionPixelPlace(result.results ?? []);
  } catch (err) {
    console.warn('[turn.pixel_place] read failed:', (err as Error).message);
    return null;
  }
}

/** Jedna linia: person_memory i/lub skrót memory_facts. Pusto, gdy klienta nie ma w pamięci. */
export function formatRecognizedMemoryLine(
  personSummary: string | null | undefined,
  factsSummary: string | null | undefined,
): string | null {
  const person = clean(personSummary, 500);
  const facts = clean(factsSummary, 500);
  if (person && facts && facts !== person) {
    return `Skrót pamięci rozpoznanego klienta: ${person} Fakty: ${facts}`;
  }
  const only = person ?? facts;
  if (!only) return null;
  return `Skrót pamięci rozpoznanego klienta: ${only}`;
}
