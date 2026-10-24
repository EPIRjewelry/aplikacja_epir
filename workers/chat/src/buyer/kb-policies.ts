import type { Env } from '../config/bindings';
import { callMcpToolDirect } from '../mcp_server';

/** Kontrakt KB §0.3 — tylko błąd MCP, bez zgadywania treści polityki. */
export const KB_POLICY_UNAVAILABLE_REPLY =
  'Nie mam dostępu do aktualnych zasad sklepu. Proszę zajrzeć do regulaminu na stronie sklepu lub skontaktować się z pracownią.';

/** Pusty wynik MCP (reason empty) — doprecyzowanie, bez faktów sklepu. */
export const KB_POLICY_EMPTY_REPLY =
  'Nie znalazłam odpowiedzi na to pytanie. Proszę doprecyzować, o co Pan lub Pani pyta.';

export function kbPolicyMissReply(reason: 'mcp_error' | 'empty'): string {
  return reason === 'empty' ? KB_POLICY_EMPTY_REPLY : KB_POLICY_UNAVAILABLE_REPLY;
}

export type PolicySource = { title: string; url: string };

export type PolicyMcpResult =
  | { ok: true; answer: string; sources: PolicySource[]; contentHash: string }
  | {
      ok: false;
      reason: 'mcp_error' | 'empty';
      subreason?: 'json_rpc_error' | 'invalid_json_200' | 'transport';
    };

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

function policySourceFromEntry(entry: Record<string, unknown>, fallbackTitle: string): PolicySource | null {
  const source = entry.source;
  if (!source || typeof source !== 'object') return null;
  const url =
    typeof (source as { url?: unknown }).url === 'string'
      ? (source as { url: string }).url.trim()
      : '';
  if (!url) return null;
  const title = fallbackTitle.trim() || url;
  return { title, url };
}

/** Shopify MCP legacy / smoke shape: `{ answers: [{ topic, body }] }`. */
function composeAnswerFromTopicBodyRows(
  rows: unknown[],
  topicKey: 'topic' | 'title' | 'question',
  bodyKey: 'body' | 'answer' | 'text',
): { answer: string; sources: PolicySource[] } {
  const parts: string[] = [];
  const sources: PolicySource[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const topic =
      typeof row[topicKey] === 'string'
        ? (row[topicKey] as string).trim()
        : typeof row.title === 'string'
          ? row.title.trim()
          : typeof row.question === 'string'
            ? row.question.trim()
            : '';
    const body =
      typeof row[bodyKey] === 'string'
        ? (row[bodyKey] as string).trim()
        : typeof row.body === 'string'
          ? row.body.trim()
          : typeof row.answer === 'string'
            ? row.answer.trim()
            : typeof row.text === 'string'
              ? row.text.trim()
              : '';
    if (!topic && !body) continue;
    if (topic && body) parts.push(`${topic}\n${body}`);
    else parts.push(topic || body);
    const src = policySourceFromEntry(row, topic || 'FAQ');
    if (src) sources.push(src);
  }
  return { answer: parts.join('\n\n'), sources };
}

/** Kontrakt §8–11: policies first (binding), then faqs. */
function composeAnswerFromPoliciesAndFaqs(parsed: Record<string, unknown>): {
  answer: string;
  sources: PolicySource[];
} {
  const parts: string[] = [];
  const sources: PolicySource[] = [];

  const policies = parsed.policies;
  if (Array.isArray(policies)) {
    for (const entry of policies) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
      const body = typeof row.body === 'string' ? row.body.trim() : '';
      const text = summary || body;
      if (!title && !text) continue;
      if (title && text) parts.push(`${title}: ${text}`);
      else parts.push(title || text);
      const src = policySourceFromEntry(row, title);
      if (src) sources.push(src);
    }
  }

  const faqs = parsed.faqs;
  if (Array.isArray(faqs)) {
    for (const entry of faqs) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const question = typeof row.question === 'string' ? row.question.trim() : '';
      const answer = typeof row.answer === 'string' ? row.answer.trim() : '';
      if (!question && !answer) continue;
      if (question && answer) parts.push(`${question}\n${answer}`);
      else parts.push(question || answer);
      const src = policySourceFromEntry(row, question || 'FAQ');
      if (src) sources.push(src);
    }
  }

  const extra = normalizeSources(parsed.sources);
  return { answer: parts.join('\n\n'), sources: [...sources, ...extra] };
}

/** Shopify KB live shape: content[].text is a JSON array of { question, answer }. */
function composeAnswerFromQaArray(rows: unknown[]): { answer: string; sources: PolicySource[] } {
  const parts: string[] = [];
  const sources: PolicySource[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const question = typeof row.question === 'string' ? row.question.trim() : '';
    const answer = typeof row.answer === 'string' ? row.answer.trim() : '';
    if (!question && !answer) continue;
    if (question && answer) parts.push(`${question}\n${answer}`);
    else parts.push(question || answer);
    const src = policySourceFromEntry(row, question || 'FAQ');
    if (src) sources.push(src);
  }
  return { answer: parts.join('\n\n'), sources };
}

function extractFromParsedJson(parsed: unknown): { answer: string; sources: PolicySource[] } {
  if (Array.isArray(parsed)) {
    const composed = composeAnswerFromQaArray(parsed);
    if (composed.answer) return composed;
    return { answer: '', sources: [] };
  }
  if (parsed && typeof parsed === 'object') {
    return extractFromRecord(parsed as Record<string, unknown>);
  }
  return { answer: '', sources: [] };
}

function extractFromRecord(parsed: Record<string, unknown>): { answer: string; sources: PolicySource[] } {
  if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
    return {
      answer: parsed.answer.trim(),
      sources: normalizeSources(parsed.sources),
    };
  }

  const composed = composeAnswerFromPoliciesAndFaqs(parsed);
  if (composed.answer) return composed;

  const answers = parsed.answers;
  if (Array.isArray(answers)) {
    const fromAnswers = composeAnswerFromTopicBodyRows(answers, 'topic', 'body');
    if (fromAnswers.answer) return fromAnswers;
  }

  const results = parsed.results;
  if (Array.isArray(results)) {
    const fromResults = composeAnswerFromTopicBodyRows(results, 'question', 'answer');
    if (fromResults.answer) return fromResults;
  }

  // Legacy: sources only without quotable body — fail closed
  if (Array.isArray(parsed.sources)) {
    return { answer: '', sources: normalizeSources(parsed.sources) };
  }

  return { answer: '', sources: [] };
}

function extractAnswerAndSources(payload: unknown): { answer: string; sources: PolicySource[] } {
  if (!payload || typeof payload !== 'object') return { answer: '', sources: [] };
  const root = payload as Record<string, unknown>;

  if (root.structuredContent && typeof root.structuredContent === 'object') {
    const sc = root.structuredContent as Record<string, unknown>;
    const fromSc = extractFromRecord(sc);
    if (fromSc.answer) return fromSc;
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
        const parsed = JSON.parse(text) as unknown;
        const fromJson = extractFromParsedJson(parsed);
        if (fromJson.answer) return fromJson;
        if (fromJson.sources.length > 0) return fromJson;
      } catch {
        // Plain text body from MCP — use as answer only when non-empty
        return { answer: text, sources: [] };
      }
    }
  }

  const fromRoot = extractFromRecord(root);
  if (fromRoot.answer || fromRoot.sources.length > 0) return fromRoot;

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
    const wrapped = out as { error?: { code?: number }; result?: unknown };
    if (wrapped.error) {
      const code = wrapped.error.code;
      const subreason =
        code === -32700 ? 'invalid_json_200' : code !== undefined ? 'json_rpc_error' : 'transport';
      return { ok: false, reason: 'mcp_error', subreason };
    }

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
