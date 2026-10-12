/**
 * Intencja odczytu koszyka — jedyne keyword-force tool_choice (get_cart).
 * create_cart / update_cart: tool_choice auto; Groq: potwierdź dane przed wywołaniem.
 * @see https://console.groq.com/docs/tool-use/local-tool-calling
 */

export type CartForcedTool = 'get_cart';

const SHOW_RE =
  /\b(poka[zż]\s+koszyk|co\s+(mam|jest)\s+w\s+koszyk|zawarto[sś][cć]\s+koszyk|m[oó]j\s+koszyk)\b/i;

/** Tylko get_cart (odczyt). Nigdy create_cart / update_cart po słowach kluczowych. */
export function detectForcedCartTool(
  userText: string,
  sessionCartId: string | null,
): CartForcedTool | null {
  const text = userText.trim();
  if (!text) return null;
  if (SHOW_RE.test(text) && sessionCartId?.trim()) return 'get_cart';
  return null;
}
