import type {ParsedFormulation} from './types';

export type ParseFormulationResult =
  | {ok: true; formulation: ParsedFormulation}
  | {ok: false; reason: string};

export function parseFormulationJson(text: string): ParseFormulationResult {
  const trimmed = text.trim();
  if (!trimmed) return {ok: false, reason: 'empty'};
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return {ok: false, reason: 'json_syntax'};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {ok: false, reason: 'not_object'};
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.text !== 'string') return {ok: false, reason: 'missing_text'};
  const refsRaw = rec.product_refs;
  const product_refs: string[] = [];
  if (Array.isArray(refsRaw)) {
    for (const r of refsRaw) {
      if (typeof r === 'string' && r.trim()) product_refs.push(r.trim());
    }
  }
  return {ok: true, formulation: {text: rec.text, product_refs}};
}
