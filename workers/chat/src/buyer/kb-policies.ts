import type { Env } from '../config/bindings';
import { callMcpToolDirect } from '../mcp_server';
import {
  formatKbEntries,
  type KbQaEntry,
  selectTopKbEntries,
} from './kb-selection';

/** Kontrakt KB §0.3 — bez zgadywania treści polityki. */
export const KB_POLICY_UNAVAILABLE_REPLY =
  'Nie mam dostępu do aktualnych zasad sklepu. Proszę zajrzeć do regulaminu na stronie sklepu lub skontaktować się z pracownią.';

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

function policyRowToEntry(row: Record<string, unknown>): KbQaEntry | null {
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
  const body = typeof row.body === 'string' ? row.body.trim() : '';
  const text = summary || body;
  if (!title && !text) return null;
  return {
    question: title || 'Polityka',
    answer: text || title,
    sourceTitle: title,
  };
}

function faqRowToEntry(row: Record<string, unknown>): KbQaEntry | null {
  const question = typeof row.question === 'string' ? row.question.trim() : '';
  const answer = typeof row.answer === 'string' ? row.answer.trim() : '';
  if (!question && !answer) return null;
  return {question, answer, sourceTitle: question || 'FAQ'};
}

function sourcesFromRows(
  rows: Record<string, unknown>[],
  titleFor: (row: Record<string, unknown>) => string,
): PolicySource[] {
  const sources: PolicySource[] = [];
  for (const row of rows) {
    const src = policySourceFromEntry(row, titleFor(row));
    if (src) sources.push(src);
  }
  return sources;
}

function applyKbSelection(
  query: string,
  entries: KbQaEntry[],
  rowSources: PolicySource[],
): { answer: string; sources: PolicySource[] } {
  const {entries: top} = selectTopKbEntries(query, entries);
  const answer = formatKbEntries(top);
  const sources = rowSources.slice(0, top.length);
  return {answer, sources};
}

/** Kontrakt §8–11: policies first (binding), then faqs; top-k + filtr kontekstu. */
function composeAnswerFromPoliciesAndFaqs(
  parsed: Record<string, unknown>,
  query: string,
): {
  answer: string;
  sources: PolicySource[];
} {
  const entries: KbQaEntry[] = [];
  const policyRows: Record<string, unknown>[] = [];

  const policies = parsed.policies;
  if (Array.isArray(policies)) {
    for (const entry of policies) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const kb = policyRowToEntry(row);
      if (kb) {
        entries.push(kb);
        policyRows.push(row);
      }
    }
  }

  const faqRows: Record<string, unknown>[] = [];
  const faqs = parsed.faqs;
  if (Array.isArray(faqs)) {
    for (const entry of faqs) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const kb = faqRowToEntry(row);
      if (kb) {
        entries.push(kb);
        faqRows.push(row);
      }
    }
  }

  const allRows = [...policyRows, ...faqRows];
  const rowSources = sourcesFromRows(allRows, (row) => {
    const q = typeof row.question === 'string' ? row.question : '';
    const t = typeof row.title === 'string' ? row.title : '';
    return (q || t || 'FAQ').trim();
  });

  const selected = applyKbSelection(query, entries, rowSources);
  const extra = normalizeSources(parsed.sources);
  return {answer: selected.answer, sources: [...selected.sources, ...extra]};
}

/** Shopify KB live shape: content[].text is a JSON array of { question, answer }. */
function composeAnswerFromQaArray(
  rows: unknown[],
  query: string,
): { answer: string; sources: PolicySource[] } {
  const entries: KbQaEntry[] = [];
  const rawRows: Record<string, unknown>[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const kb = faqRowToEntry(row);
    if (kb) {
      entries.push(kb);
      rawRows.push(row);
    }
  }
  const rowSources = sourcesFromRows(rawRows, (row) => {
    const question = typeof row.question === 'string' ? row.question.trim() : '';
    return question || 'FAQ';
  });
  return applyKbSelection(query, entries, rowSources);
}

function extractFromParsedJson(
  parsed: unknown,
  query: string,
): { answer: string; sources: PolicySource[] } {
  if (Array.isArray(parsed)) {
    const composed = composeAnswerFromQaArray(parsed, query);
    if (composed.answer) return composed;
    return { answer: '', sources: [] };
  }
  if (parsed && typeof parsed === 'object') {
    return extractFromRecord(parsed as Record<string, unknown>, query);
  }
  return { answer: '', sources: [] };
}

function extractFromRecord(
  parsed: Record<string, unknown>,
  query: string,
): { answer: string; sources: PolicySource[] } {
  if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
    const single = selectTopKbEntries(query, [
      {question: query, answer: parsed.answer.trim()},
    ]);
    const answer = formatKbEntries(single.entries);
    if (answer) {
      return {
        answer,
        sources: normalizeSources(parsed.sources),
      };
    }
    return {answer: '', sources: normalizeSources(parsed.sources)};
  }

  const composed = composeAnswerFromPoliciesAndFaqs(parsed, query);
  if (composed.answer) return composed;

  // Legacy: sources/results without answer — treat body as unavailable for quoting
  if (Array.isArray(parsed.sources) || Array.isArray(parsed.results)) {
    return { answer: '', sources: normalizeSources(parsed.sources ?? parsed.results) };
  }

  return { answer: '', sources: [] };
}

function extractAnswerAndSources(
  payload: unknown,
  query: string,
): { answer: string; sources: PolicySource[] } {
  if (!payload || typeof payload !== 'object') return { answer: '', sources: [] };
  const root = payload as Record<string, unknown>;

  if (root.structuredContent && typeof root.structuredContent === 'object') {
    const sc = root.structuredContent as Record<string, unknown>;
    const fromSc = extractFromRecord(sc, query);
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
        const fromJson = extractFromParsedJson(parsed, query);
        if (fromJson.answer) return fromJson;
        if (fromJson.sources.length > 0) return fromJson;
      } catch {
        const single = selectTopKbEntries(query, [{question: query, answer: text}]);
        const answer = formatKbEntries(single.entries);
        return { answer, sources: [] };
      }
    }
  }

  const fromRoot = extractFromRecord(root, query);
  if (fromRoot.answer || fromRoot.sources.length > 0) return fromRoot;

  return { answer: '', sources: [] };
}

/** Skrót top-k dla fallbacku formulation (bez surowego dumpu MCP). */
export function refineKbAnswerForClient(query: string, rawAnswer: string): string {
  const trimmed = rawAnswer.trim();
  if (!trimmed) return '';
  const blocks = trimmed.split(/\n\n+/).map((block) => {
    const lines = block.split('\n');
    if (lines.length >= 2) {
      return {question: lines[0], answer: lines.slice(1).join('\n')};
    }
    return {question: query, answer: block};
  });
  const {entries} = selectTopKbEntries(query, blocks);
  return formatKbEntries(entries);
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

    const { answer, sources } = extractAnswerAndSources(wrapped.result ?? wrapped, q);
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
