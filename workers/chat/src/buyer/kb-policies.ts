import type { Env } from '../config/bindings';
import { callMcpToolDirect } from '../mcp_server';

/** Kontrakt KB §0.3 — bez zgadywania treści polityki. */
export const KB_POLICY_UNAVAILABLE_REPLY =
  'Nie mam dostępu do aktualnych zasad sklepu. Proszę zajrzeć do regulaminu na stronie sklepu lub skontaktować się z pracownią.';

export type PolicySource = { title: string; url: string };

export type PolicyMcpResult =
  | { ok: true; answer: string; sources: PolicySource[]; contentHash: string }
  | { ok: false; reason: 'mcp_error' | 'empty' };

function hashSnippet(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(h)}`;
}

function normalizeSources(raw: unknown): PolicySource[] {
  if (!Array.isArray(raw)) return [];
  const out: PolicySource[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push({ title: entry.trim(), url: entry.trim() });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const title =
        typeof (entry as { title?: unknown }).title === 'string'
          ? (entry as { title: string }).title.trim()
          : '';
      const url =
        typeof (entry as { url?: unknown }).url === 'string'
          ? (entry as { url: string }).url.trim()
          : '';
      if (title || url) {
        out.push({ title: title || url, url: url || title });
      }
    }
  }
  return out;
}

function extractAnswerAndSources(payload: unknown): { answer: string; sources: PolicySource[] } {
  if (!payload || typeof payload !== 'object') return { answer: '', sources: [] };
  const root = payload as Record<string, unknown>;

  if (root.structuredContent && typeof root.structuredContent === 'object') {
    const sc = root.structuredContent as Record<string, unknown>;
    const answer = typeof sc.answer === 'string' ? sc.answer.trim() : '';
    const sources = normalizeSources(sc.sources);
    if (answer) return { answer, sources };
  }

  const content = root.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text.trim()
        : '';
      if (!text) continue;
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
          return {
            answer: parsed.answer.trim(),
            sources: normalizeSources(parsed.sources),
          };
        }
        // Legacy: sources/results without answer — treat body as unavailable for quoting
        if (Array.isArray(parsed.sources) || Array.isArray(parsed.results)) {
          return { answer: '', sources: normalizeSources(parsed.sources ?? parsed.results) };
        }
      } catch {
        // Plain text body from MCP — use as answer only when non-empty
        return { answer: text, sources: [] };
      }
    }
  }

  if (typeof root.answer === 'string' && root.answer.trim()) {
    return { answer: root.answer.trim(), sources: normalizeSources(root.sources) };
  }

  return { answer: '', sources: [] };
}

export async function searchShopPoliciesViaMcp(
  env: Env,
  query: string,
  opts?: { context?: string },
): Promise<PolicyMcpResult> {
  const q = query.trim();
  if (!q) return { ok: false, reason: 'empty' };

  const args: Record<string, unknown> = { query: q };
  if (opts?.context?.trim()) {
    args.context = opts.context.trim();
  }

  try {
    // Executor passes only query (+ context). callShopMcp may add locale/market (documented in D2 plan).
    const out = await callMcpToolDirect(env, 'search_shop_policies_and_faqs', args);
    const wrapped = out as { error?: unknown; result?: unknown };
    if (wrapped.error) return { ok: false, reason: 'mcp_error' };

    const { answer, sources } = extractAnswerAndSources(wrapped.result ?? wrapped);
    if (!answer) return { ok: false, reason: 'empty' };

    return {
      ok: true,
      answer,
      sources,
      contentHash: hashSnippet(answer),
    };
  } catch {
    return { ok: false, reason: 'mcp_error' };
  }
}
