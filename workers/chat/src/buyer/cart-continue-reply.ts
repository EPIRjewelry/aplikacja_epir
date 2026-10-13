/**
 * Deterministyczna odpowiedź z continue_url dokładnie jak z Shopify (bez UTM).
 * Atrybucja: pole attribution w create/update — https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
 * Messages warning/info MUST be displayed; presentation disclosure MUST near path —
 * https://ucp.dev/2026-08-25/specification/shopping/cart/
 */

import { extractCartObject } from '../cart/ucp-cart';
import { normalizeCartPayloadForParsing } from './cart-payload-normalize';
import {
  lookupVariantDisplay,
  type VariantOptionIndex,
} from './variant-option-gate';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Pełny tekst komunikatu — bez skracania (UCP MUST display). */
export function cartMessageFullText(rec: Record<string, unknown>): string {
  if (typeof rec.content === 'string' && rec.content.trim()) return rec.content.trim();
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
  if (typeof rec.code === 'string' && rec.code.trim()) return rec.code.trim();
  return '';
}

function isDisclosurePresentation(rec: Record<string, unknown>): boolean {
  const p = rec.presentation;
  if (p === 'disclosure') return true;
  if (p && typeof p === 'object') {
    const t = (p as { type?: unknown }).type;
    if (t === 'disclosure') return true;
  }
  return false;
}

function lineIdOf(line: Record<string, unknown>): string | null {
  for (const key of ['id', 'line_id', 'lineId'] as const) {
    const v = line[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Indeks pozycji z path/line (UCP disclosure przy komponencie).
 * @see https://ucp.dev/2026-08-25/specification/shopping/cart/
 */
export function resolveMessageLineIndex(
  rec: Record<string, unknown>,
  lineItems: unknown[],
): number | null {
  const pathRaw =
    typeof rec.path === 'string'
      ? rec.path
      : typeof rec.line === 'string'
        ? rec.line
        : typeof rec.line_id === 'string'
          ? rec.line_id
          : '';
  const path = pathRaw.trim();
  if (path) {
    // UCP path: $.line_items[0], /line_items/0, line_items[0]
    // @see https://ucp.dev/2026-08-25/specification/shopping/cart/
    const idxMatch =
      path.match(/\$\.?line_items\[(\d+)\]/i) ||
      path.match(/line_items\[(\d+)\]/i) ||
      path.match(/line_items\/(\d+)/i) ||
      path.match(/\/lines\/(\d+)/i);
    if (idxMatch?.[1] != null) {
      const idx = Number(idxMatch[1]);
      if (Number.isInteger(idx) && idx >= 0 && idx < lineItems.length) return idx;
    }
    for (let i = 0; i < lineItems.length; i++) {
      const row = lineItems[i];
      if (!row || typeof row !== 'object') continue;
      const lid = lineIdOf(row as Record<string, unknown>);
      if (lid && (path === lid || path.endsWith(`/${lid}`) || path.includes(lid))) {
        return i;
      }
    }
  }
  if (typeof rec.line_index === 'number' && Number.isInteger(rec.line_index)) {
    const idx = rec.line_index;
    if (idx >= 0 && idx < lineItems.length) return idx;
  }
  return null;
}

export type PartitionedCartMessages = {
  /** Pełne teksty disclosure przy indeksie pozycji (notice pod linią). */
  disclosuresByLineIndex: Map<number, string[]>;
  /** warning (MUST) oraz opcjonalnie info — pełne teksty. */
  globalNotices: string[];
  /** messages type=error — pełne teksty (bez continue_url). */
  errors: string[];
};

export function partitionCartMessages(
  messages: unknown,
  lineItems: unknown[],
): PartitionedCartMessages {
  const disclosuresByLineIndex = new Map<number, string[]>();
  const globalNotices: string[] = [];
  const errors: string[] = [];
  if (!Array.isArray(messages)) {
    return { disclosuresByLineIndex, globalNotices, errors };
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const rec = m as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type.toLowerCase() : '';
    const text = cartMessageFullText(rec);
    if (!text) continue;
    if (type === 'error') {
      errors.push(text);
      continue;
    }
    if (type !== 'warning' && type !== 'info') continue;
    if (type === 'warning' && isDisclosurePresentation(rec)) {
      const idx = resolveMessageLineIndex(rec, lineItems);
      if (idx !== null) {
        const list = disclosuresByLineIndex.get(idx) ?? [];
        list.push(text);
        disclosuresByLineIndex.set(idx, list);
        continue;
      }
      // Disclosure bez resolvable path — i tak pokaż (nigdy nie pomijaj).
      globalNotices.push(text);
      continue;
    }
    // warning MUST; info opcjonalnie — pokazujemy gdy treść jest.
    globalNotices.push(text);
  }
  return { disclosuresByLineIndex, globalNotices, errors };
}

/** Warning (MUST) + info (opcjonalnie). Error osobno — formatCartErrorFromMessages. */
export function formatCartNoticeFromMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const rec = m as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type.toLowerCase() : '';
    if (type !== 'warning' && type !== 'info') continue;
    const text = cartMessageFullText(rec);
    if (text) out.push(text);
  }
  return out;
}

/** Pełne teksty messages type=error — bez skracania. */
export function formatCartErrorFromMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const rec = m as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type.toLowerCase() : '';
    if (type !== 'error') continue;
    const text = cartMessageFullText(rec);
    if (text) out.push(text);
  }
  return out;
}

/** Odpowiedź przy błędzie koszyka — treść dla klienta, bez linku continue_url. */
export function buildCartErrorReply(errors: string[]): string {
  const parts = errors.map((e) => e.trim()).filter(Boolean);
  if (!parts.length) {
    return 'Nie udało się zaktualizować koszyka. Proszę spróbować ponownie.';
  }
  return parts.join('\n\n');
}

function currencySuffix(currency: unknown): string {
  if (typeof currency !== 'string' || !currency.trim()) return '';
  const c = currency.trim().toUpperCase();
  if (c === 'PLN') return ' zł';
  return ` ${c}`;
}

/**
 * Suma szacunkowa — waluta z totals / koszyka, bez hardcodu „zł” dla innych walut.
 */
export function formatCartTotalsNote(
  totals: unknown,
  cartCurrency?: string | null,
): string | null {
  if (!Array.isArray(totals)) return null;
  for (const t of totals) {
    if (!t || typeof t !== 'object') continue;
    const rec = t as Record<string, unknown>;
    if (rec.type !== 'total') continue;
    const amount = rec.amount;
    const currency =
      (typeof rec.currency === 'string' && rec.currency.trim()) ||
      (typeof cartCurrency === 'string' && cartCurrency.trim()) ||
      null;
    const display =
      typeof rec.display_pl === 'string'
        ? rec.display_pl
        : typeof rec.price_display_pl === 'string'
          ? rec.price_display_pl
          : typeof amount === 'number'
            ? `${(amount / 100).toFixed(2)}${currencySuffix(currency)}`
            : typeof amount === 'string'
              ? `${amount}${currency ? currencySuffix(currency) : ''}`
              : null;
    if (display) {
      return `Suma szacunkowa: ${display} (ostateczna kwota w kasie).`;
    }
  }
  return null;
}

function lineTitleFromRaw(line: Record<string, unknown>): string | null {
  const item = line.item;
  if (item && typeof item === 'object') {
    const t = (item as { title?: unknown }).title;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  const merch = line.merchandise;
  if (merch && typeof merch === 'object') {
    const m = merch as Record<string, unknown>;
    const pt = m.product;
    if (pt && typeof pt === 'object') {
      const title = (pt as { title?: unknown }).title;
      if (typeof title === 'string' && title.trim()) return title.trim();
    }
    const mt = m.title;
    if (typeof mt === 'string' && mt.trim()) return mt.trim();
  }
  return null;
}

function variantIdFromLine(line: Record<string, unknown>): string | null {
  const item = line.item;
  if (item && typeof item === 'object') {
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

function optionsFromLine(line: Record<string, unknown>): string | null {
  const item = line.item;
  if (item && typeof item === 'object') {
    const opts = (item as { selected_options?: unknown }).selected_options;
    if (Array.isArray(opts)) {
      const bits = opts
        .map((o) => {
          if (!o || typeof o !== 'object') return '';
          const rec = o as Record<string, unknown>;
          const n = typeof rec.name === 'string' ? rec.name : '';
          const v = typeof rec.value === 'string' ? rec.value : '';
          return n && v && v !== 'Default Title' ? `${n} ${v}` : '';
        })
        .filter(Boolean);
      if (bits.length) return bits.join(', ');
    }
  }
  return null;
}

function formatPriceMinor(minor: number, currency: string | null | undefined): string {
  const cur = (currency || 'PLN').toUpperCase();
  const amount = (minor / 100).toFixed(2);
  return cur === 'PLN' ? `${amount} zł` : `${amount} ${cur}`;
}

/** Cena pozycji z payloadu koszyka (wynik narzędzia) albo z indeksu katalogu. */
function priceFromLine(
  line: Record<string, unknown>,
  catalogIndex?: VariantOptionIndex,
  variantId?: string | null,
): string | null {
  const item = line.item;
  if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    if (typeof rec.price === 'number' && Number.isFinite(rec.price)) {
      const cur = typeof rec.currency === 'string' ? rec.currency : 'PLN';
      // UCP: amount często w minor units.
      return formatPriceMinor(rec.price, cur);
    }
    if (rec.price && typeof rec.price === 'object') {
      const p = rec.price as Record<string, unknown>;
      const amount = typeof p.amount === 'number' ? p.amount : null;
      const cur = typeof p.currency === 'string' ? p.currency : 'PLN';
      if (amount !== null) return formatPriceMinor(amount, cur);
    }
  }
  if (variantId && catalogIndex) {
    const entry = catalogIndex.get(variantId);
    if (typeof entry?.priceMinor === 'number') {
      return formatPriceMinor(entry.priceMinor, entry.priceCurrency);
    }
  }
  return null;
}

export function formatCartLineSummaries(
  cartPayload: unknown,
  catalogIndex?: VariantOptionIndex,
  disclosuresByLineIndex?: Map<number, string[]>,
): string[] {
  const normalized = normalizeCartPayloadForParsing(cartPayload);
  const cart = extractCartObject(normalized);
  const rawLines = cart && Array.isArray(cart.line_items) ? cart.line_items : [];
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const row = rawLines[i];
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const qty = typeof rec.quantity === 'number' ? rec.quantity : null;
    if (qty === null || qty < 1) continue;
    let title = lineTitleFromRaw(rec);
    let opts = optionsFromLine(rec);
    const vid = variantIdFromLine(rec);
    if (vid && catalogIndex) {
      const lookup = lookupVariantDisplay(catalogIndex, vid);
      const entry = catalogIndex.get(vid);
      if (lookup) {
        if (!title && lookup.title) title = lookup.title;
      }
      // Pełny wariant: wszystkie opcje z katalogu/faktu (nie tylko z raw linii).
      if (entry?.selectedOptions?.length) {
        const fullOpts = entry.selectedOptions
          .filter((o) => o.value && o.value !== 'Default Title')
          .map((o) => `${o.name} ${o.value}`)
          .join(', ');
        if (fullOpts) opts = fullOpts;
      } else if (!opts && lookup?.optionsLine) {
        opts = lookup.optionsLine;
      }
    }
    const priceLine = priceFromLine(rec, catalogIndex, vid);
    const parts: string[] = [];
    if (title) parts.push(title);
    if (opts) parts.push(opts);
    if (priceLine) parts.push(priceLine);
    parts.push(`${qty} szt.`);
    if (parts.length === 1 && parts[0]?.endsWith(' szt.')) {
      // Brak nazwy/opcji — i tak pokaż disclosure przy indeksie, jeśli jest.
      const disclosures = disclosuresByLineIndex?.get(i) ?? [];
      if (!disclosures.length) continue;
      for (const d of disclosures) {
        lines.push(`• ${d}`);
      }
      continue;
    }
    lines.push(`• ${parts.join(' — ')}`);
    const disclosures = disclosuresByLineIndex?.get(i) ?? [];
    for (const d of disclosures) {
      // Pełny tekst disclosure bezpośrednio pod pozycją (UCP presentation disclosure).
      lines.push(`  ${d}`);
    }
  }
  return lines;
}

/** Usuwa z tekstu modelu linki Markdown i bare URL równe exact continue_url. */
export function stripContinueUrlFromModelText(text: string, continueUrl: string): string {
  const url = continueUrl.trim();
  if (!url || !text) return text;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = text.replace(
    new RegExp(`\\[[^\\]]*\\]\\(${escaped}\\)`, 'gi'),
    '',
  );
  out = out.replace(new RegExp(escaped, 'gi'), '');
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const CART_C_MD_LINK_RE = /\[[^\]]*\]\(https?:\/\/[^)\s]*\/cart\/c\/[^)\s]*\)/gi;
const CART_C_BARE_URL_RE = /https?:\/\/[^\s)\]>]*\/cart\/c\/[^\s)\]>]*/gi;

/**
 * Po mutacji: usuń z tekstu modelu każdy link /cart/c/… (stary z sesji i nowy),
 * żeby w odpowiedzi został tylko continue_url z bloku deterministycznego.
 */
export function stripAllCartContinueLinks(text: string): string {
  if (!text) return text;
  let out = text.replace(CART_C_MD_LINK_RE, '');
  out = out.replace(CART_C_BARE_URL_RE, '');
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Usuwa tylko linie zaczynające się od urwany Markdown link (`[` bez domknięcia `](`).
 * Nie wycina akapitu, gdy `[…]` jest w środku zdania.
 */
export function stripBrokenMarkdownLinkPrefix(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');
  const kept = lines.filter((line) => {
    const t = line.trimStart();
    if (!t.startsWith('[')) return true;
    // Pełny link Markdown na linii — zostaw.
    if (/\[[^\]]*\]\([^)]*\)/.test(t)) return true;
    // Linia zaczyna się od [ i nie ma poprawnego ]( — urwany link.
    return false;
  });
  return kept.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** CTA / nagłówek sekcji koszyka w prozie modelu — od tego ucinamy końcówkę przy merge. */
const MODEL_CART_SECTION_MARKERS: readonly string[] = [
  'Stan koszyka',
  'Przejdź do koszyka',
  'Zobacz koszyk i przejdź do kasy',
  'Link do koszyka',
  'Zobacz koszyk',
  'Przejdź do kasy',
];

/**
 * Ucina końcową sekcję koszyka z tekstu modelu (nagłówek lub CTA).
 * Zostawia wstęp nad pierwszym markerem.
 */
export function stripTrailingModelCartSection(text: string): string {
  if (!text.trim()) return text;
  const lower = text.toLowerCase();
  let cutAt = -1;
  for (const marker of MODEL_CART_SECTION_MARKERS) {
    const idx = lower.lastIndexOf(marker.toLowerCase());
    if (idx >= 0 && (cutAt < 0 || idx < cutAt)) cutAt = idx;
  }
  if (cutAt < 0) return text;
  return text.slice(0, cutAt).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Usuwa zdania modelu deklarujące stan koszyka — autorytatywny opis jest w bloku serwera.
 */
export function stripModelCartStateClaims(text: string): string {
  if (!text.trim()) return text;
  const claimRe =
    /[^.!?\n]*(?:dodał(?:am|em)?\s+do\s+koszyka|dodano\s+do\s+koszyka|koszyk\s+jest\s+(?:pusty|zaktualizowany)|koszyk\s+został\s+zaktualizowany)[^.!?\n]*[.!?]?/gi;
  let out = text.replace(claimRe, '');
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/** Po usunięciu linków koszyka: sieroty `)`, `](`, resztki etykiet. */
export function stripCartLinkOrphans(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/\]\(\s*\)?/g, '');
  out = out.replace(/^\s*\)\s*$/gm, '');
  out = out.replace(/\(\s*\)/g, '');
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

export type BuildCartContinueReplyInput = {
  continueUrl: string;
  notices?: string[];
  totalsNote?: string | null;
  cartPayload?: unknown;
  catalogIndex?: VariantOptionIndex;
};

/** Dokładne porównanie continue_url — bez doklejania UTM. */
export function buildCartContinueReply(
  continueUrlOrInput: string | BuildCartContinueReplyInput,
  notices: string[] = [],
  totalsNote?: string | null,
): string {
  const input: BuildCartContinueReplyInput =
    typeof continueUrlOrInput === 'string'
      ? { continueUrl: continueUrlOrInput, notices, totalsNote }
      : continueUrlOrInput;

  const parts: string[] = [];
  let disclosuresByLineIndex = new Map<number, string[]>();
  let globalFromPayload: string[] = [];
  /** null = brak payloadu / brak tablicy; [] = jawnie pusty koszyk. */
  let rawLineItems: unknown[] | null = null;

  if (input.cartPayload != null) {
    const normalized = normalizeCartPayloadForParsing(input.cartPayload);
    const cart = extractCartObject(normalized);
    if (cart && Array.isArray(cart.line_items)) {
      rawLineItems = cart.line_items;
    } else if (isRecord(input.cartPayload) && Array.isArray(input.cartPayload.line_items)) {
      // Płaski payload { line_items: [] } — extractCartObject może zwrócić null.
      rawLineItems = input.cartPayload.line_items;
    }
    const rawLines = rawLineItems ?? [];
    const messages = cart?.messages;
    const partitioned = partitionCartMessages(messages, rawLines);
    disclosuresByLineIndex = partitioned.disclosuresByLineIndex;
    globalFromPayload = partitioned.globalNotices;

    // Disclosure z path wskazującym linię, które formatCartNoticeFromMessages pominął —
    // jeśli path nie rozwiązany wyżej, partition już wrzucił do global.
    if (Array.isArray(messages)) {
      for (const m of messages) {
        if (!m || typeof m !== 'object') continue;
        const rec = m as Record<string, unknown>;
        if (!isDisclosurePresentation(rec)) continue;
        const text = cartMessageFullText(rec);
        if (!text) continue;
        const idx = resolveMessageLineIndex(rec, rawLines);
        if (idx === null && !globalFromPayload.includes(text)) {
          globalFromPayload.push(text);
        }
      }
    }
  }

  const lineSummaries = input.cartPayload
    ? formatCartLineSummaries(
        input.cartPayload,
        input.catalogIndex,
        disclosuresByLineIndex,
      )
    : [];
  parts.push('Stan koszyka (dane sklepu)');
  if (lineSummaries.length) {
    parts.push(...lineSummaries);
  } else if (rawLineItems && rawLineItems.length === 0) {
    parts.push('Koszyk jest pusty.');
  } else {
    parts.push('Koszyk jest zaktualizowany.');
  }

  const seen = new Set<string>();
  const pushNotice = (n: string) => {
    const t = n.trim();
    if (!t || seen.has(t)) return;
    // Nie powtarzaj disclosure już przy pozycji.
    for (const list of disclosuresByLineIndex.values()) {
      if (list.includes(t)) return;
    }
    seen.add(t);
    parts.push(t);
  };
  for (const n of globalFromPayload) pushNotice(n);
  for (const n of input.notices ?? []) pushNotice(n);

  const totals = input.totalsNote ?? null;
  if (totals?.trim()) parts.push(totals.trim());
  parts.push(`[Przejdź do koszyka](${input.continueUrl.trim()})`);
  return parts.join('\n\n');
}

/**
 * Po udanej mutacji: tekst modelu (bez linków do koszyka) + blok „Stan koszyka (dane sklepu)”.
 * Bez heurystyk sprzeczności ilości/rozmiaru.
 */
export function mergeModelTextWithCartBlock(
  modelText: string,
  cartBlock: string,
  continueUrl: string,
): string {
  // Najpierw wszystkie /cart/c/ (stary+nowy), potem exact continue_url, potem broken [.
  let stripped = stripAllCartContinueLinks(modelText);
  stripped = stripContinueUrlFromModelText(stripped, continueUrl);
  stripped = stripTrailingModelCartSection(stripped);
  stripped = stripModelCartStateClaims(stripped);
  stripped = stripBrokenMarkdownLinkPrefix(stripped);
  stripped = stripCartLinkOrphans(stripped);
  if (!stripped.trim()) return cartBlock;
  return `${stripped}\n\n${cartBlock}`;
}

/**
 * Po mutacji w tej turze:
 * - ostrzeżenia/info UCP zawsze (nawet gdy model podał continue_url),
 * - exact continue_url tylko gdy brakuje,
 * - totals note gdy brakuje.
 * @see https://ucp.dev/2026-08-25/specification/shopping/cart/
 */
export function appendExactContinueUrlIfMissing(
  reply: string,
  continueUrl: string | null | undefined,
  notices: string[] = [],
  totalsNote?: string | null,
): string {
  const url = continueUrl?.trim() || '';
  const missingNotices = notices.filter((n) => n.trim() && !reply.includes(n.trim()));
  const missingTotals =
    totalsNote?.trim() && !reply.includes(totalsNote.trim()) ? totalsNote.trim() : null;
  const missingUrl = Boolean(url && !reply.includes(url));

  if (!missingNotices.length && !missingTotals && !missingUrl) return reply;

  const parts: string[] = [];
  if (reply.trim()) parts.push(reply.trim());
  for (const n of missingNotices) parts.push(n.trim());
  if (missingTotals) parts.push(missingTotals);
  if (missingUrl) parts.push(`[Przejdź do koszyka](${url})`);
  return parts.join('\n\n');
}
