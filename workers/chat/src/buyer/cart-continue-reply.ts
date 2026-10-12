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
    const idxMatch = path.match(/line_items\/(\d+)/i) || path.match(/\/lines\/(\d+)/i);
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
  /** Pełne teksty disclosure przy indeksie pozycji. */
  disclosuresByLineIndex: Map<number, string[]>;
  /** warning/info bez disclosure liniowego — pełne teksty. */
  globalNotices: string[];
};

export function partitionCartMessages(
  messages: unknown,
  lineItems: unknown[],
): PartitionedCartMessages {
  const disclosuresByLineIndex = new Map<number, string[]>();
  const globalNotices: string[] = [];
  if (!Array.isArray(messages)) {
    return { disclosuresByLineIndex, globalNotices };
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const rec = m as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type : '';
    if (type !== 'warning' && type !== 'info') continue;
    const text = cartMessageFullText(rec);
    if (!text) continue;
    if (isDisclosurePresentation(rec)) {
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
    globalNotices.push(text);
  }
  return { disclosuresByLineIndex, globalNotices };
}

/** Wszystkie warning/info — pełny tekst (bez skracania). Liniowe disclosure i tak
 * renderuje buildCartContinueReply przy pozycji i deduplikuje w globalnych notices. */
export function formatCartNoticeFromMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const rec = m as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type : '';
    if (type !== 'warning' && type !== 'info') continue;
    const text = cartMessageFullText(rec);
    if (text) out.push(text);
  }
  return out;
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
    if ((!title || !opts) && vid && catalogIndex) {
      const lookup = lookupVariantDisplay(catalogIndex, vid);
      if (lookup) {
        if (!title && lookup.title) title = lookup.title;
        if (!opts && lookup.optionsLine) opts = lookup.optionsLine;
      }
    }
    const parts: string[] = [];
    if (title) parts.push(title);
    if (opts) parts.push(opts);
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

/**
 * Heurystyka: model podaje ilość/rozmiar sprzeczne z wynikiem koszyka.
 */
export function modelContradictsCartPayload(
  modelText: string,
  cartPayload: unknown,
): boolean {
  if (!modelText.trim() || cartPayload == null) return false;
  const normalized = normalizeCartPayloadForParsing(cartPayload);
  const cart = extractCartObject(normalized);
  const rawLines = cart && Array.isArray(cart.line_items) ? cart.line_items : [];
  const cartQtys = new Set<number>();
  const cartOptionValues = new Set<string>();
  for (const row of rawLines) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.quantity === 'number') cartQtys.add(rec.quantity);
    const opts = optionsFromLine(rec);
    if (opts) {
      for (const part of opts.split(',')) {
        const m = part.trim().match(/(\d+(?:[.,]\d+)?)\s*$/);
        if (m?.[1]) cartOptionValues.add(m[1].replace(',', '.'));
      }
    }
    const item = rec.item;
    if (item && typeof item === 'object') {
      const so = (item as { selected_options?: unknown }).selected_options;
      if (Array.isArray(so)) {
        for (const o of so) {
          if (!o || typeof o !== 'object') continue;
          const v = (o as { value?: unknown }).value;
          if (typeof v === 'string' && /^\d/.test(v.trim())) {
            cartOptionValues.add(v.trim());
          }
        }
      }
    }
  }
  for (const m of modelText.matchAll(/(\d+)\s*szt/gi)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && cartQtys.size > 0 && !cartQtys.has(n)) return true;
  }
  for (const m of modelText.matchAll(/rozmiar\s*[:=]?\s*(\d+(?:[.,]\d+)?)/gi)) {
    const v = (m[1] || '').replace(',', '.');
    if (v && cartOptionValues.size > 0 && !cartOptionValues.has(v)) return true;
  }
  return false;
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

  if (input.cartPayload != null) {
    const normalized = normalizeCartPayloadForParsing(input.cartPayload);
    const cart = extractCartObject(normalized);
    const rawLines = cart && Array.isArray(cart.line_items) ? cart.line_items : [];
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
  if (lineSummaries.length) {
    parts.push('W koszyku:');
    parts.push(...lineSummaries);
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
 * Składa prefix modelu + deterministyczny blok po mutacji.
 * Usuwa zduplikowane linki continue_url; przy sprzeczności ilości/rozmiaru — tylko blok.
 */
export function mergeModelTextWithCartBlock(
  modelText: string,
  cartBlock: string,
  continueUrl: string,
  cartPayload?: unknown,
): string {
  const stripped = stripContinueUrlFromModelText(modelText, continueUrl);
  if (!stripped.trim()) return cartBlock;
  if (cartPayload != null && modelContradictsCartPayload(stripped, cartPayload)) {
    return cartBlock;
  }
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
