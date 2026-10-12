/**
 * Deterministyczna odpowiedź z continue_url dokładnie jak z Shopify (bez UTM).
 * Atrybucja: pole attribution w create/update — https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
 * Messages warning/info MUST be displayed: https://ucp.dev/2026-08-25/specification/shopping/cart/
 */

import { extractCartObject } from '../cart/ucp-cart';
import { normalizeCartPayloadForParsing } from './cart-payload-normalize';
import {
  lookupVariantDisplay,
  type VariantOptionIndex,
} from './variant-option-gate';

export function formatCartNoticeFromMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const rec = m as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type : '';
    if (type !== 'warning' && type !== 'info') continue;
    const content =
      typeof rec.content === 'string'
        ? rec.content.trim()
        : typeof rec.message === 'string'
          ? rec.message.trim()
          : '';
    const code = typeof rec.code === 'string' ? rec.code.trim() : '';
    if (content) out.push(content);
    else if (code) out.push(code);
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
): string[] {
  const normalized = normalizeCartPayloadForParsing(cartPayload);
  const cart = extractCartObject(normalized);
  const rawLines = cart && Array.isArray(cart.line_items) ? cart.line_items : [];
  const lines: string[] = [];
  for (const row of rawLines) {
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
      continue;
    }
    lines.push(`• ${parts.join(' — ')}`);
  }
  return lines;
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
  const lineSummaries = input.cartPayload
    ? formatCartLineSummaries(input.cartPayload, input.catalogIndex)
    : [];
  if (lineSummaries.length) {
    parts.push('W koszyku:');
    parts.push(...lineSummaries);
  } else {
    parts.push('Koszyk jest zaktualizowany.');
  }

  const noticeList = input.notices ?? [];
  for (const n of noticeList) {
    if (n.trim()) parts.push(n.trim());
  }
  const totals = input.totalsNote ?? null;
  if (totals?.trim()) parts.push(totals.trim());
  parts.push(`[Przejdź do koszyka](${input.continueUrl.trim()})`);
  return parts.join('\n\n');
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
