/**
 * Deterministyczna odpowiedź z continue_url dokładnie jak z Shopify (bez UTM).
 * Atrybucja: pole attribution w create/update — https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
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

export function formatCartTotalsNote(totals: unknown): string | null {
  if (!Array.isArray(totals)) return null;
  for (const t of totals) {
    if (!t || typeof t !== 'object') continue;
    const rec = t as Record<string, unknown>;
    if (rec.type !== 'total') continue;
    const amount = rec.amount;
    const display =
      typeof rec.display_pl === 'string'
        ? rec.display_pl
        : typeof amount === 'number'
          ? `${(amount / 100).toFixed(2)} zł`
          : typeof amount === 'string'
            ? amount
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
 * Po mutacji w tej turze: jeśli reply nie zawiera exact continue_url z Shopify —
 * dołącz ostrzeżenia + link (bez UTM, bez zmiany URL).
 * @see https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
 * @see https://ucp.dev/2026-08-25/specification/shopping/cart/
 */
export function appendExactContinueUrlIfMissing(
  reply: string,
  continueUrl: string | null | undefined,
  notices: string[] = [],
  totalsNote?: string | null,
): string {
  const url = continueUrl?.trim();
  if (!url) return reply;
  if (reply.includes(url)) return reply;
  const parts: string[] = [];
  if (reply.trim()) parts.push(reply.trim());
  for (const n of notices) {
    if (n.trim() && !reply.includes(n.trim())) parts.push(n.trim());
  }
  if (totalsNote?.trim() && !reply.includes(totalsNote.trim())) {
    parts.push(totalsNote.trim());
  }
  parts.push(`[Przejdź do koszyka](${url})`);
  return parts.join('\n\n');
}
