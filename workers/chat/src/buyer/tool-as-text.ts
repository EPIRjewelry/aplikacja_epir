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

function pushVariantId(out: string[], raw: unknown): void {
  if (typeof raw !== 'string') return;
  const id = raw.trim();
  if (id.includes('ProductVariant')) out.push(id);
}

/** Variant GID z tool-as-text (line_items / add_items / arguments). */
export function variantIdsFromToolAsText(text: string): string[] {
  const found: string[] = [];
  for (const obj of extractJsonObjectsFromText(text)) {
    if (!looksLikeToolObject(obj)) continue;
    const bags: unknown[] = [
      obj.line_items,
      obj.add_items,
      obj.update_items,
      isRecord(obj.arguments) ? obj.arguments.line_items : null,
      isRecord(obj.arguments) ? obj.arguments.add_items : null,
      isRecord(obj.parameters) ? obj.parameters.line_items : null,
      isRecord(obj.parameters) ? obj.parameters.add_items : null,
      isRecord(obj.cart) ? obj.cart.line_items : null,
    ];
    for (const bag of bags) {
      if (!Array.isArray(bag)) continue;
      for (const entry of bag) {
        if (!isRecord(entry)) continue;
        pushVariantId(found, entry.product_variant_id);
        pushVariantId(found, entry.merchandise_id);
        pushVariantId(found, entry.variant_id);
        if (isRecord(entry.item)) pushVariantId(found, entry.item.id);
        pushVariantId(found, entry.id);
      }
    }
  }
  return [...new Set(found)];
}

/**
 * create/update z tool-as-text wolno wymusić tylko gdy każdy wykryty wariant
 * jest na allowliście katalogu/faktów; brak wariantu = nie wymuszaj.
 */
export function toolAsTextCartMutationAllowed(
  text: string,
  allowedVariantIds: Set<string>,
): boolean {
  const name = toolNameFromAsText(text);
  if (name !== 'create_cart' && name !== 'update_cart') return false;
  const ids = variantIdsFromToolAsText(text);
  if (ids.length === 0) return false;
  return ids.every((id) => allowedVariantIds.has(id));
}

export const ASK_VARIANT_BEFORE_CART_MESSAGE =
  'Proszę wskazać rozmiar lub wariant produktu, zanim dodam go do koszyka.';

