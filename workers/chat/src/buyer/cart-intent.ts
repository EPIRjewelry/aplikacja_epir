/**
 * Lekka heurystyka intencji koszyka (PL) — wymuszenie tool_choice bez nadmiernego
 * odpalania przy zwykłych pytaniach produktowych.
 */

export type CartForcedTool = 'create_cart' | 'update_cart' | 'get_cart';

const ADD_RE =
  /\b(dodaj|wrzu[cć]|dolo[zż]|wrzucamy|dodajcie)\b.*\b(koszyk|koszyka)\b|\bdo\s+koszyka\b/i;
const UPDATE_QTY_RE =
  /\b(zmie[nń]\s+(ilo[sś][cć]|na\s+\d+)|ilo[sś][cć]\s+na\s+\d+|usu[nń]\s+(z\s+)?koszyk|wyjmij\s+z\s+koszyk)/i;
const SHOW_RE =
  /\b(poka[zż]\s+koszyk|co\s+(mam|jest)\s+w\s+koszyk|zawarto[sś][cć]\s+koszyk|m[oó]j\s+koszyk)\b/i;

export function detectForcedCartTool(
  userText: string,
  sessionCartId: string | null,
): CartForcedTool | null {
  const text = userText.trim();
  if (!text) return null;

  if (SHOW_RE.test(text)) {
    return sessionCartId ? 'get_cart' : null;
  }
  if (UPDATE_QTY_RE.test(text)) {
    return sessionCartId ? 'update_cart' : null;
  }
  if (ADD_RE.test(text)) {
    return sessionCartId ? 'update_cart' : 'create_cart';
  }
  return null;
}
