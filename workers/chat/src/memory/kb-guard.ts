/**
 * KB-guard: twarde reguły egzekwujące kontrakt KB/MCP w warstwie pamięci.
 *
 * - Treści polityk/FAQ (wynik `search_shop_policies_and_faqs`) NIGDY nie trafiają
 *   do `memory_facts` ani do Vectorize `memory_customer`.
 * - Wypowiedzi asystenta, które nastąpiły po tool-callu do KB, są traktowane
 *   jako "cień KB" i też nie są indeksowane (ale mogą wyprodukować `policy_touch`).
 * - Wypowiedzi użytkownika o politykach stają się `intent` (fact o kliencie),
 *   nigdy nie `fact` o sklepie.
 *
 * @see docs/EPIR_KB_MCP_POLICY_CONTRACT.md
 */

export const POLICY_TOOL_NAMES = new Set<string>([
  'search_shop_policies_and_faqs',
  'search_policies_and_faqs',
]);

export const PRODUCT_TOOL_NAMES = new Set<string>([
  'search_catalog',
  'get_product_details',
]);

export const CART_TOOL_NAMES = new Set<string>([
  'update_cart',
  'get_cart',
  'add_to_cart',
  'remove_from_cart',
]);

export type KbGuardDecision =
  | { allow: true }
  | { allow: false; reason: 'policy_tool_result' | 'policy_cited_assistant' | 'policy_text_like' };

/** Fragmenty (bezpieczne / syntetyczne), które sugerują dosłowny cytat z polityki. */
const POLICY_LIKE_PATTERNS: RegExp[] = [
  /\breturn\s+policy\b/i,
  /\brefund\s+policy\b/i,
  /\bshipping\s+policy\b/i,
  /\bprivacy\s+policy\b/i,
  /\bterms\s+of\s+service\b/i,
  /\bpolityka\s+zwrot/i,
  /\bpolityka\s+wysy/i,
  /\bpolityka\s+prywatno/i,
  /\bregulamin\s+sklepu\b/i,
  /\bwarunki\s+u[sś]ł?ug/i,
];

/**
 * Czy wynik tool-calla pochodzi z narzędzia KB (polityki/FAQ)?
 * Używane do oznaczenia całej tury za "policy-touch" i wykluczenia asystenta z indeksu.
 */
export function isPolicyToolName(toolName: string | null | undefined): boolean {
  if (!toolName) return false;
  return POLICY_TOOL_NAMES.has(toolName);
}

export function isProductToolName(toolName: string | null | undefined): boolean {
  if (!toolName) return false;
  return PRODUCT_TOOL_NAMES.has(toolName);
}

export function isCartToolName(toolName: string | null | undefined): boolean {
  if (!toolName) return false;
  return CART_TOOL_NAMES.has(toolName);
}

/**
 * Decyduje, czy dany tekst (wypowiedź asystenta LUB kandydat na fakt) może trafić
 * do indeksu pamięci klienta (Vectorize `memory_customer`) lub do `memory_facts`.
 *
 * Zasada: asystent po policy-tool-call nie jest indeksowany, a nawet gdy tool nie
 * był wołany w tej turze — treść wygląda na cytat z polityki → blokada.
 */
export function kbGuardCheck(input: {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  toolName?: string | null;
  turnUsedPolicyTool?: boolean;
}): KbGuardDecision {
  if (input.role === 'tool' && isPolicyToolName(input.toolName ?? null)) {
    return { allow: false, reason: 'policy_tool_result' };
  }
  if (input.role === 'assistant' && input.turnUsedPolicyTool) {
    return { allow: false, reason: 'policy_cited_assistant' };
  }
  const text = String(input.text ?? '');
  if (text.length > 0) {
    for (const pattern of POLICY_LIKE_PATTERNS) {
      if (pattern.test(text)) {
        return { allow: false, reason: 'policy_text_like' };
      }
    }
  }
  return { allow: true };
}

/**
 * Maska prostego PII przed embeddingiem. Konserwatywna — nadpisuje e-maile,
 * numery telefonów, numery kart, adresy e-mail i długie ciągi cyfr.
 */
export function maskPII(text: string): { masked: string; changed: boolean } {
  if (!text) return { masked: '', changed: false };
  let changed = false;
  let out = text;
  const replacers: Array<[RegExp, string]> = [
    [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
    [/\b(?:\+?48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g, '[PHONE]'],
    [/\b\d{16}\b/g, '[CARD]'],
    [/\b\d{11}\b/g, '[PESEL]'],
  ];
  for (const [re, placeholder] of replacers) {
    if (re.test(out)) {
      out = out.replace(re, placeholder);
      changed = true;
    }
  }
  return { masked: out, changed };
}
