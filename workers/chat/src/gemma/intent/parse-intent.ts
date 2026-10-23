import {validateGemmaIntent, type GemmaIntent, type IntentParseError} from './schema';

export type ParseIntentResult =
  | {ok: true; intent: GemmaIntent}
  | {ok: false; error: IntentParseError};

export function parseIntentJson(text: string): ParseIntentResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {ok: false, error: {kind: 'parse', message: 'empty'}};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return {ok: false, error: {kind: 'parse', message: 'json_syntax'}};
  }
  const validated = validateGemmaIntent(raw);
  if ('kind' in validated) {
    return {ok: false, error: validated};
  }
  return {ok: true, intent: validated};
}
