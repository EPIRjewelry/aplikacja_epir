/**
 * Logika sesji zakupu jak w Q1/Q7 — jedna sesja nawet przy purchase_completed + order_attributed.
 */

export const PURCHASE_EVENT_TYPES = new Set([
  'purchase_completed',
  'checkout_completed',
  'order_attributed',
]);

export type PixelStreamLike = { session_id: string; event_type: string };
export type ChatStreamLike = { session_id: string; role: string };

export function purchaseSessionIdsFromPixel(rows: PixelStreamLike[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const sid = r.session_id?.trim();
    if (!sid) continue;
    if (PURCHASE_EVENT_TYPES.has(r.event_type)) out.add(sid);
  }
  return out;
}

export function chatUserSessionIds(rows: ChatStreamLike[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.role !== 'user') continue;
    const sid = r.session_id?.trim();
    if (sid) out.add(sid);
  }
  return out;
}

/** Sesje z czatem użytkownika, które mają też sygnał zakupu w pixelu. */
export function q1SessionsWithChatAndPurchase(
  pixelRows: PixelStreamLike[],
  chatRows: ChatStreamLike[],
): string[] {
  const purchases = purchaseSessionIdsFromPixel(pixelRows);
  const chat = chatUserSessionIds(chatRows);
  const matched: string[] = [];
  for (const sid of chat) {
    if (purchases.has(sid)) matched.push(sid);
  }
  return matched.sort();
}
