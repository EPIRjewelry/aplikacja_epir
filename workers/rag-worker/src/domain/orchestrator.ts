/**
 * RAG Worker - Domain: Orchestrator
 *
 * Decision logic for RAG data retrieval.
 * Determines WHEN to use MCP vs Vectorize based on intent and availability.
 *
 * PRIORITY (per EPIR_KB_MCP_POLICY_CONTRACT.md):
 * 1. MCP (Shopify Storefront MCP) — primary for policies/FAQ
 * 2. Vectorize — fallback ONLY for non-binding informational FAQ/blog-like content when MCP is empty
 * 3. Binding policy queries (returns, shipping, terms, …) — NO Vectorize fallback (KB-clamp circuit breaker)
 *
 * @see workers/chat/src/rag.ts - searchShopPoliciesAndFaqsWithMCP
 */

import {
  searchProducts,
  getCart,
  getMostRecentOrder,
  searchPoliciesFaq,
} from '../services/shopify-mcp';
import { searchFaqVectorize, VectorizeIndex, AIBinding } from '../services/vectorize';
import { RagSearchResult, RagResultItem } from './formatter';

/**
 * User intent types
 */
export type UserIntent = 'search' | 'cart' | 'order' | 'faq' | null;

/** Error code returned when MCP cannot serve binding policy content — callers MUST NOT substitute Vectorize/RAG. */
export const POLICY_SYSTEM_UNAVAILABLE = 'POLICY_SYSTEM_UNAVAILABLE' as const;

export type OrchestrateRagSuccess = { ok: true; context: string };
export type OrchestrateRagFailure = {
  ok: false;
  error: { code: typeof POLICY_SYSTEM_UNAVAILABLE; message: string };
};
export type OrchestrateRagResult = OrchestrateRagSuccess | OrchestrateRagFailure;

/**
 * Normalize for PL/EN matching: lowercase + strip diacritics + fold `ł→l`.
 *
 * We intentionally fold PL diacritics so stem-substrings match all inflections
 * (`zwrócić` → `zwrocic`, `wysyłka` → `wysylka`, `odesłać` → `odeslac`).
 */
function normalizePolicyQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
}

/** DJB2 hash of NFD-stripped + ł→l normalized query — logs without raw PII. */
export function hashQueryForKbClampLog(query: string): string {
  const n = normalizePolicyQuery(query);
  let h = 5381;
  for (let i = 0; i < n.length; i++) {
    h = ((h << 5) + h) ^ n.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Structured log for dashboards / logpush counts (`metric: kb_clamp_blocked_total`). */
function emitKbClampBlocked(params: {
  intent: UserIntent;
  locale?: string;
  query: string;
}): void {
  console.warn(
    JSON.stringify({
      event: 'POLICY_SYSTEM_UNAVAILABLE',
      metric: 'kb_clamp_blocked_total',
      code: POLICY_SYSTEM_UNAVAILABLE,
      intent: params.intent ?? null,
      locale: params.locale ?? 'unknown',
      query_hash: hashQueryForKbClampLog(params.query),
    }),
  );
}

/**
 * Patterns that mark a query as **binding store policy** (returns, shipping,
 * warranty, terms, privacy/GDPR, etc.). When any pattern matches, Vectorize
 * fallback is FORBIDDEN (KB-clamp).
 *
 * Design bias: **over-detect rather than leak**. False positives here only
 * downgrade MCP-empty fallback for FAQ-shaped queries to a controlled
 * `POLICY_SYSTEM_UNAVAILABLE` message — never a wrong binding answer from RAG.
 *
 * Keep in sync with `workers/chat/src/rag.ts` (`BINDING_POLICY_PATTERNS`).
 *
 * English `policy`/`policies` use contextual phrases only (return/privacy/… policy
 * or policy on/for/…, our/your/the … policies) — not bare “policy”, to reduce
 * non-store false positives while keeping over-detect elsewhere.
 */
const BINDING_POLICY_PATTERNS: readonly RegExp[] = [
  // --- Polish stems (operate on diacritic-stripped text) ---
  // returns / exchanges / withdrawal from contract
  /zwrot/i,
  /zwroc/i,
  /zwraca/i,
  /zwruot/i,  // common typo
  /zwrut/i,
  /odesl/i,   // odesłać, odesłanie, odeslij
  /odsyl/i,   // odsyłam, odsyłka
  /wymian/i,  // wymiana, wymianę, wymianie
  /wymien/i,  // wymienić, wymieniać
  /odstap/i,  // odstąpienie od umowy
  /14\s*dni/i,
  /30\s*dni/i,
  // complaints / warranty / repair
  /reklamac/i,
  /napraw/i,
  /gwaranc/i,
  /rekojm/i,  // rękojmia → rekojm
  // shipping / delivery / courier
  /wysyl/i,   // wysyłka, wysyłki, wysyłać
  /przesylk/i,
  /dostaw/i,  // dostawa, dostawy, dostawą
  /dostarc/i, // dostarczyć, dostarczenie
  /kurier/i,
  /paczk/i,
  /paczkomat/i,
  /\b(inpost|dpd|dhl|fedex|ups|orlen\s*paczka)\b/i,
  /czas\s+(dostaw|wysyl|realizac)/i,
  /koszt(y|u|em)?\s+(dostaw|wysyl|zwrot)/i,
  /oplat[ayę]\s+(za\s+)?(wysyl|dostaw|zwrot)/i,
  /darmow[aąe]\s+(wysyl|dostaw)/i,
  // terms / policy / privacy / GDPR / invoicing
  /regulamin/i,
  /polityk/i,          // polityka zwrotów, wysyłki, prywatności, sklepu…
  /prywatno/i,         // prywatność / prywatności
  /dane\s+osobow/i,
  /\brodo\b/i,
  /ochrona\s+danych/i,
  /cookie/i,
  /plik(i|ów)\s+cookies?/i,
  /paragon/i,
  /faktur/i,
  /prawo\s+konsument/i,
  /ustawa\s+o\s+prawach\s+konsument/i,

  // --- English (word-boundary) ---
  // returns / refund / exchange / withdrawal
  /\breturn(s|ed|ing|able)?\b/i,
  /\brefund(s|ed|ing|able)?\b/i,
  /\bexchange(s|d|ing)?\b/i,
  /\bmoney[-\s]?back\b/i,
  /\bcooling[-\s]?off\b/i,
  /\bwithdraw(al)?\b/i,
  /\b(14|30)[-\s]?day(s)?\b/i,
  // warranty / complaint / repair
  /\bwarrant(y|ies)\b/i,
  /\bguarantee(s|d)?\b/i,
  /\bcomplaint(s)?\b/i,
  /\brepair(s|ed|ing)?\b/i,
  // shipping / delivery / courier / tracking / fees
  /\bship(ping|ment|ments|ped|s)?\b/i,
  /\bdeliver(y|ies|ed|ing)\b/i,
  /\bcourier(s)?\b/i,
  /\bpostage\b/i,
  /\btracking\b/i,
  /\bparcel(s)?\b/i,
  /\bpickup\s+point(s)?\b/i,
  /\bfree\s+(ship|delivery)/i,
  // terms / policy / privacy / GDPR / consumer rights
  /\bterms\s+(of\s+(service|use|sale)|and\s+conditions)\b/i,
  /\bt&c(s)?\b/i,
  /\btos\b/i,
  /\bprivacy\b/i,
  /\bgdpr\b/i,
  /\bdata\s+protection\b/i,
  /\bconsumer\s+rights?\b/i,
  /\bstatutory\s+rights?\b/i,
  // English "policy/policies": contextual only — avoids bare "policy" (e.g. non-store copy).
  /\b(return|refund|shipping|delivery|privacy|exchange|warranty|cancellation|cookie|store|sale)\s+polic(y|ies)\b/i,
  /\bpolic(y|ies)\s+(on|for|regarding|about|covering)\b/i,
  /\b(our|your|the)\s+(store\s+)?polic(y|ies)\b/i,
  /\breceipt(s)?\b/i,
  /\binvoice(s)?\b/i,
];

/**
 * Explicitly NON-binding exceptions — narrow list of phrases that may mention
 * the words above but ask for non-regulatory context (e.g. gemmological care,
 * editorial content). Used ONLY when no stronger binding pattern matched.
 */
// Soft-exemption patterns run against the DIACRITIC-STRIPPED lowercase text.
const BINDING_POLICY_SOFT_EXEMPTIONS: readonly RegExp[] = [
  /\bfaq\s+o\s+(kamieni|kolekcji|stylu|pielegnacj)/i,
  /\bpytania\s+i\s+odpowiedzi\s+o\s+(kamieni|kolekcji|stylu|pielegnacj)/i,
];

/**
 * True when the query targets binding shop obligations (returns, shipping,
 * warranty, terms, privacy/GDPR, invoicing). Over-detects deliberately — false
 * positives are acceptable; leaking to RAG is NOT. Mirror of the implementation
 * in `workers/chat/src/rag.ts`.
 */
export function isBindingPolicyQuery(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  const normalized = normalizePolicyQuery(query);
  const matched = BINDING_POLICY_PATTERNS.some((re) => re.test(normalized));
  if (!matched) return false;
  // Soft exemptions apply only if no strong binding keyword is present alongside.
  if (BINDING_POLICY_SOFT_EXEMPTIONS.some((re) => re.test(normalized))) {
    const strongBinding =
      /zwrot|refund|reklamac|complaint|wysyl|ship|dostaw|deliver|gwaranc|warrant|rekojm|regulamin|polityk|prywatno|gdpr|rodo|terms|withdraw|odstap/i.test(
        normalized,
      );
    return strongBinding;
  }
  return true;
}

function extractMcpFaqPlainText(mcpFaq: unknown): string | null {
  if (!mcpFaq || typeof mcpFaq !== 'object') return null;
  const content = (mcpFaq as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const faqText = content
    .filter((c: unknown) => {
      const x = c as { type?: string; text?: string };
      return x.type === 'text' && typeof x.text === 'string';
    })
    .map((c: unknown) => (c as { text: string }).text)
    .join('\n')
    .trim();
  return faqText || null;
}

/**
 * RAG orchestration options
 */
export interface RagOptions {
  query: string;
  intent?: UserIntent;
  cartId?: string | null;
  vectorIndex?: VectorizeIndex;
  aiBinding?: AIBinding;
  topK?: number;
  /** MCP endpoint - z env.CANONICAL_MCP_URL (wrangler.toml [vars]) */
  mcpEndpoint?: string;
  /** BCP47-ish hint from Accept-Language (observability only). */
  locale?: string;
}

/**
 * Detect user intent from query
 *
 * @param query - User query
 * @returns Detected intent
 */
export function detectIntent(query: string): UserIntent {
  const msg = query.toLowerCase();

  const cartKeywords = [
    'koszyk',
    'dodaj do koszyka',
    'w koszyku',
    'zawartość koszyka',
    'co mam w koszyku',
    'usuń z koszyka',
    'aktualizuj koszyk',
    'pokaż koszyk',
    'cart',
    'add to cart',
    'show cart',
    'my cart',
    'what is in my cart',
    'update cart',
  ];

  const orderKeywords = [
    'zamówienie',
    'mojego zamówienia',
    'status zamówienia',
    'moje zamówienie',
    'śledzenie',
    'śledzenie przesyłki',
    'gdzie jest',
    'kiedy dotrze',
    'ostatnie zamówienie',
    'order status',
    'order',
    'track my order',
    'recent order',
    'where is my package',
  ];

  const faqKeywords = [
    'polityka',
    'zwrot',
    'wysyłka',
    'dostawa',
    'reklamacja',
    'gwarancja',
    'policy',
    'return',
    'shipping',
    'delivery',
    'complaint',
    'warranty',
    'faq',
  ];

  if (cartKeywords.some((keyword) => msg.includes(keyword))) {
    return 'cart';
  }
  if (orderKeywords.some((keyword) => msg.includes(keyword))) {
    return 'order';
  }
  if (faqKeywords.some((keyword) => msg.includes(keyword))) {
    return 'faq';
  }
  // Safety net: catch adversarial / obfuscated policy queries that escape
  // the simple faqKeywords list (e.g. "jak odesłać prezent?").
  if (isBindingPolicyQuery(query)) {
    return 'faq';
  }

  // Default: product search
  return 'search';
}

/**
 * Orchestrate RAG data retrieval
 *
 * @param options - RAG orchestration options
 * @returns Context string on success, or POLICY_SYSTEM_UNAVAILABLE when binding policy MCP cannot serve (no Vectorize)
 */
export async function orchestrateRag(options: RagOptions): Promise<OrchestrateRagResult> {
  const { query, intent, cartId, vectorIndex, aiBinding, topK = 3, mcpEndpoint } = options;

  let output = '';

  try {
    // CART INTENT: Get cart data via MCP
    if (intent === 'cart' && cartId && mcpEndpoint) {
      console.log('[RAG_WORKER/Orchestrator] 🛒 Cart intent detected');

      const cartRaw = await getCart(mcpEndpoint, cartId);

      if (cartRaw && cartRaw.content) {
        const cartText = cartRaw.content
          .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n');

        if (cartText) {
          output += `\n[KOSZYK (MCP)]\n${cartText}\n`;
        }
      }
    }

    // ORDER INTENT: Get order status via MCP
    if (intent === 'order' && mcpEndpoint) {
      console.log('[RAG_WORKER/Orchestrator] 📦 Order intent detected');

      const orderRaw = await getMostRecentOrder(mcpEndpoint);

      if (orderRaw && orderRaw.content) {
        const orderText = orderRaw.content
          .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n');

        if (orderText) {
          output += `\n[OSTATNIE ZAMÓWIENIE (MCP)]\n${orderText}\n`;
        }
      }
    }

    // FAQ INTENT: MCP primary; Vectorize ONLY if NOT binding policy query
    if (intent === 'faq') {
      console.log('[RAG_WORKER/Orchestrator] ❓ FAQ intent detected');

      const binding = isBindingPolicyQuery(query);
      const mcpFaq = mcpEndpoint ? await searchPoliciesFaq(mcpEndpoint, query) : null;
      const faqText = extractMcpFaqPlainText(mcpFaq);

      if (faqText) {
        output += `\n[FAQ/POLITYKI (MCP)]\n${faqText}\n`;
      } else if (!binding && vectorIndex && aiBinding) {
        console.log('[Orchestrator] MCP FAQ empty — Vectorize fallback (non-binding query only)');
        const vectorResults = await searchFaqVectorize(query, vectorIndex, aiBinding, topK);
        if (vectorResults.length > 0) {
          output += `\n[FAQ/INFO (Vectorize — non-binding)]\n`;
          vectorResults.forEach((r, idx) => {
            output += `${idx + 1}. ${r.title || r.id}: ${r.snippet}\n`;
          });
        }
      } else if (binding) {
        console.warn('[Orchestrator] KB-clamp: binding policy query — Vectorize fallback blocked (MCP empty/error)');
        emitKbClampBlocked({
          intent: intent ?? 'faq',
          locale: options.locale,
          query,
        });
        return {
          ok: false,
          error: {
            code: POLICY_SYSTEM_UNAVAILABLE,
            message:
              'Shopify policy service (Storefront MCP) did not return usable content; Vectorize fallback is disabled for binding policy queries per EPIR_KB_MCP_POLICY_CONTRACT.',
          },
        };
      }
    }

    // SEARCH INTENT (default): Product search via MCP
    if ((intent === 'search' || !intent) && mcpEndpoint) {
      console.log('[Orchestrator] 🔍 Product search intent');

      const productContext = await searchProducts(mcpEndpoint, query, 'biżuteria');

      if (productContext) {
        output += `\n${productContext}\n`;
      }
    }

    return { ok: true, context: output.trim() };
  } catch (error) {
    console.error('[Orchestrator] ❌ Error:', error);
    return { ok: true, context: '' };
  }
}

/**
 * Build full RAG context with structured results
 *
 * Alternative to orchestrateRag that returns structured RagSearchResult
 * instead of plain string. Useful for fine-grained control.
 */
export async function buildRagContext(options: RagOptions): Promise<RagSearchResult> {
  const { query, intent, vectorIndex, aiBinding, topK = 3, mcpEndpoint } = options;

  const results: RagResultItem[] = [];

  try {
    if (intent === 'faq') {
      const binding = isBindingPolicyQuery(query);
      const mcpFaq = mcpEndpoint ? await searchPoliciesFaq(mcpEndpoint, query) : null;

      if (mcpFaq && mcpFaq.content && mcpFaq.content.length > 0) {
        mcpFaq.content
          .filter((c: any) => c.type === 'text')
          .forEach((c: any, idx: number) => {
            results.push({
              id: `faq_mcp_${idx + 1}`,
              title: c.title || undefined,
              text: c.text || '',
              snippet: (c.text || '').slice(0, 500),
              source: 'mcp',
              metadata: c,
            });
          });
      } else if (!binding && vectorIndex && aiBinding) {
        const vectorResults = await searchFaqVectorize(query, vectorIndex, aiBinding, topK);
        results.push(...vectorResults);
      } else if (binding) {
        emitKbClampBlocked({
          intent: intent ?? 'faq',
          locale: options.locale,
          query,
        });
        return {
          query,
          results: [],
          error: {
            code: POLICY_SYSTEM_UNAVAILABLE,
            message:
              'Shopify policy service (Storefront MCP) did not return usable content; Vectorize fallback is disabled for binding policy queries per EPIR_KB_MCP_POLICY_CONTRACT.',
          },
        };
      }
    }

    if ((intent === 'search' || !intent) && mcpEndpoint) {
      const productText = await searchProducts(mcpEndpoint, query, 'biżuteria');

      if (productText) {
        results.push({
          id: 'products_mcp',
          text: productText,
          snippet: productText.slice(0, 500),
          source: 'mcp',
        });
      }
    }

    return { query, results };
  } catch (error) {
    console.error('[Orchestrator] ❌ buildRagContext error:', error);
    return { query, results: [] };
  }
}
