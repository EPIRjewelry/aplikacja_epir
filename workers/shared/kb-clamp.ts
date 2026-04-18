/**
 * Shared KB-clamp heuristic (EPIR_KB_MCP_POLICY_CONTRACT — "Policy Oracle").
 *
 * Single source of truth for:
 *   - `POLICY_SYSTEM_UNAVAILABLE` error code
 *   - normalization (NFD + `ł→l`) used by pattern matching
 *   - `BINDING_POLICY_PATTERNS` (PL + EN stems, biased to over-detect)
 *   - `BINDING_POLICY_SOFT_EXEMPTIONS` (narrow "FAQ o kolekcji" style copy)
 *   - `isBindingPolicyQuery(query)` classifier
 *   - `emitKbClampBlocked(...)` structured log (metric: kb_clamp_blocked_total)
 *
 * DESIGN:
 *   - Over-detection is preferred over RAG leakage. False positives only
 *     downgrade MCP-empty fallbacks to a controlled
 *     `POLICY_SYSTEM_UNAVAILABLE` response — never a wrong binding answer.
 *   - English `policy`/`policies` is matched in context only
 *     (e.g. "return/privacy/shipping policy", "policy on/for/…",
 *     "our/your/the … policies") to avoid collateral false positives
 *     ("foreign policy", "what is policy").
 *   - Analytics policy: log the **raw_query** so the administrator (sole
 *     BigQuery owner) can study adversarial prompts. RODO compliance comes
 *     from hard 180-day retention on the log warehouse, NOT hashing.
 *
 * Both `workers/rag-worker` and `workers/chat` import this module.
 */

/** Must be referenced as-is wherever we speak JSON over the wire. */
export const POLICY_SYSTEM_UNAVAILABLE = 'POLICY_SYSTEM_UNAVAILABLE' as const;
export type PolicySystemUnavailable = typeof POLICY_SYSTEM_UNAVAILABLE;

/** Human-readable message returned alongside POLICY_SYSTEM_UNAVAILABLE. */
export const POLICY_SYSTEM_UNAVAILABLE_MESSAGE =
  'Shopify policy service (Storefront MCP) did not return usable content; Vectorize fallback is disabled for binding policy queries per EPIR_KB_MCP_POLICY_CONTRACT.';

/**
 * Lowercase + strip diacritics + fold `ł→l`. Keeps PL inflections matchable
 * with simple stem-substring patterns (e.g. `zwrócić` → `zwrocic`).
 */
export function normalizePolicyQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
}

/**
 * Patterns that mark a query as BINDING store policy. Any match ⇒ Vectorize
 * fallback is FORBIDDEN. Patterns run against the normalized text.
 */
export const BINDING_POLICY_PATTERNS: readonly RegExp[] = [
  // --- Polish stems (diacritic-stripped) ---
  // returns / exchanges / withdrawal
  /zwrot/i,
  /zwroc/i,
  /zwraca/i,
  /zwruot/i, // common typo
  /zwrut/i,
  /odesl/i,
  /odsyl/i,
  /wymian/i,
  /wymien/i,
  /odstap/i,
  /14\s*dni/i,
  /30\s*dni/i,
  // complaints / warranty / repair
  /reklamac/i,
  /napraw/i,
  /gwaranc/i,
  /rekojm/i,
  // shipping / delivery / courier / fees
  /wysyl/i,
  /przesylk/i,
  /dostaw/i,
  /dostarc/i,
  /kurier/i,
  /paczk/i,
  /paczkomat/i,
  /\b(inpost|dpd|dhl|fedex|ups|orlen\s*paczka)\b/i,
  /czas\s+(dostaw|wysyl|realizac)/i,
  /koszt(y|u|em)?\s+(dostaw|wysyl|zwrot)/i,
  /oplat[aye]\s+(za\s+)?(wysyl|dostaw|zwrot)/i,
  /darmow[aae]\s+(wysyl|dostaw)/i,
  // terms / policy / privacy / GDPR / invoicing
  /regulamin/i,
  /polityk/i,
  /prywatno/i,
  /dane\s+osobow/i,
  /\brodo\b/i,
  /ochrona\s+danych/i,
  /cookie/i,
  /plik(i|ow)\s+cookies?/i,
  /paragon/i,
  /faktur/i,
  /prawo\s+konsument/i,
  /ustawa\s+o\s+prawach\s+konsument/i,

  // --- English (word-boundary) ---
  /\breturn(s|ed|ing|able)?\b/i,
  /\brefund(s|ed|ing|able)?\b/i,
  /\bexchange(s|d|ing)?\b/i,
  /\bmoney[-\s]?back\b/i,
  /\bcooling[-\s]?off\b/i,
  /\bwithdraw(al)?\b/i,
  /\b(14|30)[-\s]?day(s)?\b/i,
  /\bwarrant(y|ies)\b/i,
  /\bguarantee(s|d)?\b/i,
  /\bcomplaint(s)?\b/i,
  /\brepair(s|ed|ing)?\b/i,
  /\bship(ping|ment|ments|ped|s)?\b/i,
  /\bdeliver(y|ies|ed|ing)\b/i,
  /\bcourier(s)?\b/i,
  /\bpostage\b/i,
  /\btracking\b/i,
  /\bparcel(s)?\b/i,
  /\bpickup\s+point(s)?\b/i,
  /\bfree\s+(ship|delivery)/i,
  /\bterms\s+(of\s+(service|use|sale)|and\s+conditions)\b/i,
  /\bt&c(s)?\b/i,
  /\btos\b/i,
  /\bprivacy\b/i,
  /\bgdpr\b/i,
  /\bdata\s+protection\b/i,
  /\bconsumer\s+rights?\b/i,
  /\bstatutory\s+rights?\b/i,
  // contextual `policy/policies` only
  /\b(return|refund|shipping|delivery|privacy|exchange|warranty|cancellation|cookie|store|sale)\s+polic(y|ies)\b/i,
  /\bpolic(y|ies)\s+(on|for|regarding|about|covering)\b/i,
  /\b(our|your|the)\s+(store\s+)?polic(y|ies)\b/i,
  /\breceipt(s)?\b/i,
  /\binvoice(s)?\b/i,
];

/**
 * Narrow list of phrases that MAY mention policy-adjacent words but ask for
 * non-regulatory context (care, styling, materials). Applied only when no
 * stronger binding signal is present in the same query.
 *
 * Patterns run against the DIACRITIC-STRIPPED lowercase text.
 */
export const BINDING_POLICY_SOFT_EXEMPTIONS: readonly RegExp[] = [
  /\bfaq\s+o\s+(kamieni|kolekcji|stylu|pielegnacj)/i,
  /\bpytania\s+i\s+odpowiedzi\s+o\s+(kamieni|kolekcji|stylu|pielegnacj)/i,
];

const STRONG_BINDING_OVERRIDE =
  /zwrot|refund|reklamac|complaint|wysyl|ship|dostaw|deliver|gwaranc|warrant|rekojm|regulamin|polityk|prywatno|gdpr|rodo|terms|withdraw|odstap/i;

/**
 * True when the query targets binding shop obligations (returns, shipping,
 * warranty, terms, privacy/GDPR, invoicing). Over-detects deliberately.
 */
export function isBindingPolicyQuery(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  const normalized = normalizePolicyQuery(query);
  const matched = BINDING_POLICY_PATTERNS.some((re) => re.test(normalized));
  if (!matched) return false;
  if (BINDING_POLICY_SOFT_EXEMPTIONS.some((re) => re.test(normalized))) {
    return STRONG_BINDING_OVERRIDE.test(normalized);
  }
  return true;
}

/** Intent values recorded in KB-clamp logs (kept permissive for forward-compat). */
export type KbClampIntent = 'faq' | 'search' | 'cart' | 'order' | null;

export interface KbClampLogParams {
  intent: KbClampIntent;
  /** Optional BCP47-ish locale hint (observability only). */
  locale?: string;
  /**
   * Raw user query. Stored as-is by design — the administrator is the sole
   * BigQuery owner and needs full visibility of adversarial prompts. RODO is
   * handled by hard 180-day retention, not hashing.
   */
  query: string;
  /** Optional origin tag ("rag-worker" | "chat-worker-local-fallback" | ...). */
  source?: string;
}

const MAX_RAW_QUERY_LOG_CHARS = 512;

function sanitizeRawQueryForLog(query: string): string {
  const normalized = typeof query === 'string' ? query : '';
  const piiMasked = normalized
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/\b(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){7,14}\d\b/g, '[PHONE_OR_ID]');
  if (piiMasked.length <= MAX_RAW_QUERY_LOG_CHARS) return piiMasked;
  return `${piiMasked.slice(0, MAX_RAW_QUERY_LOG_CHARS)}…[truncated]`;
}

/**
 * Emits a structured `console.warn(JSON.stringify(...))` that Cloudflare
 * Logpush / BigQuery can aggregate by `metric: kb_clamp_blocked_total`.
 * Shared between `workers/rag-worker` and `workers/chat` for parity.
 */
export function emitKbClampBlocked(params: KbClampLogParams): void {
  console.warn(
    JSON.stringify({
      event: 'POLICY_SYSTEM_UNAVAILABLE',
      metric: 'kb_clamp_blocked_total',
      code: POLICY_SYSTEM_UNAVAILABLE,
      intent: params.intent ?? null,
      locale: params.locale ?? 'unknown',
      source: params.source ?? 'unknown',
      raw_query: sanitizeRawQueryForLog(params.query),
    }),
  );
}
