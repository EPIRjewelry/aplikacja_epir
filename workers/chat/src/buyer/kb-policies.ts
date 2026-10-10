import type { Env } from '../config/bindings';
import { callMcpToolDirect } from '../mcp_server';

/** Kontrakt KB §0.3 — bez zgadywania treści polityki. */
export const KB_POLICY_UNAVAILABLE_REPLY =
  'Nie mam dostępu do aktualnych zasad sklepu. Proszę zajrzeć do regulaminu na stronie sklepu lub skontaktować się z pracownią.';

export type PolicyMcpResult =
  | { ok: true; sources: string[]; contentHash: string }
  | { ok: false; reason: 'mcp_error' | 'empty' };

function hashSnippet(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(h)}`;
}

export async function searchShopPoliciesViaMcp(env: Env, query: string): Promise<PolicyMcpResult> {
  const q = query.trim();
  if (!q) return { ok: false, reason: 'empty' };
  try {
    const out = await callMcpToolDirect(env, 'search_shop_policies_and_faqs', { query: q });
    const wrapped = out as { error?: unknown; result?: { content?: Array<{ text?: string }> } };
    if (wrapped.error) return { ok: false, reason: 'mcp_error' };
    const text = wrapped.result?.content?.[0]?.text?.trim() ?? '';
    if (!text) return { ok: false, reason: 'empty' };
    let sources: string[] = [];
    try {
      const parsed = JSON.parse(text) as { sources?: string[]; results?: Array<{ id?: string }> };
      if (Array.isArray(parsed.sources)) sources = parsed.sources.filter(Boolean);
      if (!sources.length && Array.isArray(parsed.results)) {
        sources = parsed.results.map((r) => r.id).filter(Boolean) as string[];
      }
    } catch {
      sources = [];
    }
    return { ok: true, sources, contentHash: hashSnippet(text) };
  } catch {
    return { ok: false, reason: 'mcp_error' };
  }
}
