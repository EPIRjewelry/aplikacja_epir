/**
 * Wykrywanie intencji „polityka / regulamin / zwroty / FAQ sklepu" wyłącznie z treści
 * wiadomości użytkownika (heurystyka — nie jest wstrzykiwana do promptu systemowego).
 *
 * Lista markerów PL + EN służy WYŁĄCZNIE do routingu pierwszej tury narzędzi
 * (wymuszenie `search_shop_policies_and_faqs`). Nie steruje językiem odpowiedzi
 * i nie trafia do kontekstu modelu.
 */

const POLICY_MARKERS_PL = [
  'zwrot',
  'zwroty',
  'reklamac',
  'gwaranc',
  'regulamin',
  'polityk',
  'dostaw',
  'wysyłk',
  'wysylk',
  'prawo odstąpienia',
  'prawo odstapienia',
  'odstąpienie',
  'odstapienie',
  'rękojmi',
  'rekojmi',
  'faq',
];

const POLICY_MARKERS_EN = [
  'return',
  'refund',
  'warranty',
  'shipping',
  'delivery',
  'policy',
  'policies',
  'terms',
  'cancellation',
  'withdrawal',
  'complaint',
  'faq',
];

export function detectPolicyInformationIntent(userMessage: string): { match: boolean } {
  if (typeof userMessage !== 'string') return { match: false };
  const norm = userMessage.trim().toLowerCase();
  if (!norm) return { match: false };
  for (const m of POLICY_MARKERS_PL) {
    if (norm.includes(m)) return { match: true };
  }
  for (const m of POLICY_MARKERS_EN) {
    if (norm.includes(m)) return { match: true };
  }
  return { match: false };
}
