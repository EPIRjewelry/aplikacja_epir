/**
 * Wykrywa gdy model wypisał wywołanie narzędzia jako treść zamiast tool_calls.
 * @see https://console.groq.com/docs/tool-use/local-tool-calling
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeToolObject(obj: Record<string, unknown>): boolean {
  if (typeof obj.action === 'string' && obj.action.trim()) return true;
  if (typeof obj.tool === 'string' && obj.tool.trim()) return true;
  if (
    typeof obj.name === 'string' &&
    obj.name.trim() &&
    (obj.arguments !== undefined || obj.parameters !== undefined)
  ) {
    return true;
  }
  return false;
}

/** Wyciąga obiekty JSON z surowego tekstu i bloków ```json. */
export function extractJsonObjectsFromText(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const trimmed = text.trim();
  if (!trimmed) return out;

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fence: RegExpExecArray | null;
  const chunks: string[] = [];
  while ((fence = fenceRe.exec(trimmed)) !== null) {
    if (fence[1]?.trim()) chunks.push(fence[1].trim());
  }
  if (chunks.length === 0) chunks.push(trimmed);

  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk) as unknown;
      if (isRecord(parsed)) out.push(parsed);
      continue;
    } catch {
      /* try brace scan */
    }
    const start = chunk.indexOf('{');
    const end = chunk.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(chunk.slice(start, end + 1)) as unknown;
      if (isRecord(parsed)) out.push(parsed);
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function looksLikeToolCallAsText(text: string): boolean {
  return extractJsonObjectsFromText(text).some(looksLikeToolObject);
}

/** Nazwy kluczy z wykrytego JSON — do logów bez wartości. */
export function toolAsTextKeyNames(text: string): string[] {
  const keys = new Set<string>();
  for (const obj of extractJsonObjectsFromText(text)) {
    if (!looksLikeToolObject(obj)) continue;
    for (const k of Object.keys(obj)) keys.add(k);
  }
  return [...keys].sort();
}

/** Nazwa narzędzia z tekstu (action / tool / name), jeśli wygląda na tool-call. */
export function toolNameFromAsText(text: string): string | null {
  for (const obj of extractJsonObjectsFromText(text)) {
    if (!looksLikeToolObject(obj)) continue;
    if (typeof obj.action === 'string' && obj.action.trim()) return obj.action.trim();
    if (typeof obj.tool === 'string' && obj.tool.trim()) return obj.tool.trim();
    if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
  }
  return null;
}
