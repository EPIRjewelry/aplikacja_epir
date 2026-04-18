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
import {
  POLICY_SYSTEM_UNAVAILABLE,
  POLICY_SYSTEM_UNAVAILABLE_MESSAGE,
  emitKbClampBlocked,
  isBindingPolicyQuery,
} from '../../../shared/kb-clamp';

/**
 * User intent types
 */
export type UserIntent = 'search' | 'cart' | 'order' | 'faq' | null;

// Re-exports for downstream callers (tests, wrappers).
export { POLICY_SYSTEM_UNAVAILABLE, isBindingPolicyQuery };

export type OrchestrateRagSuccess = { ok: true; context: string };
export type OrchestrateRagFailure = {
  ok: false;
  error: { code: typeof POLICY_SYSTEM_UNAVAILABLE; message: string };
};
export type OrchestrateRagResult = OrchestrateRagSuccess | OrchestrateRagFailure;

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
          source: 'rag-worker',
        });
        return {
          ok: false,
          error: {
            code: POLICY_SYSTEM_UNAVAILABLE,
            message: POLICY_SYSTEM_UNAVAILABLE_MESSAGE,
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
          source: 'rag-worker',
        });
        return {
          query,
          results: [],
          error: {
            code: POLICY_SYSTEM_UNAVAILABLE,
            message: POLICY_SYSTEM_UNAVAILABLE_MESSAGE,
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
