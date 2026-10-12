/**
 * Deterministyczna odpowiedź z continue_url dokładnie jak z Shopify (bez UTM).
 * Atrybucja: pole attribution w create/update — https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
 * Messages warning/info MUST be displayed: https://ucp.dev/2026-08-25/specification/shopping/cart/
 */

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

/** Dokładne porównanie continue_url — bez doklejania UTM. */
export function buildCartContinueReply(
  continueUrl: string,
  notices: string[] = [],
  totalsNote?: string | null,
): string {
  const parts: string[] = ['Koszyk jest zaktualizowany.'];
  for (const n of notices) {
    if (n.trim()) parts.push(n.trim());
  }
  if (totalsNote?.trim()) parts.push(totalsNote.trim());
  parts.push(`[Przejdź do koszyka](${continueUrl})`);
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
