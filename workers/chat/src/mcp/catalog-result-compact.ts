/**
 * Współdzielone obcinanie pól opisowych w wyniku `search_catalog` (ścieżka czatu + shopify-mcp-client).
 * Mniejszy JSON do LLM → krótszy prefill i mniejsza „pokusa” cytowania marketingu.
 */

/** Maks. długość pól opisowych przekazywanych modelowi. */
export const CATALOG_DESCRIPTION_MAX_CHARS = 150;

const CATALOG_DESCRIPTION_FIELDS = new Set([
  'description',
  'body_html',
  'descriptionHtml',
  'tagline',
  'subtitle',
]);

function truncateDescriptionFieldsDeep(value: unknown, depth: number): unknown {
  if (depth <= 0 || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => truncateDescriptionFieldsDeep(item, depth - 1));
  }
  if (typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (
      typeof child === 'string' &&
      CATALOG_DESCRIPTION_FIELDS.has(key) &&
      child.length > CATALOG_DESCRIPTION_MAX_CHARS
    ) {
      output[key] = child.slice(0, CATALOG_DESCRIPTION_MAX_CHARS).trimEnd() + '…';
    } else {
      output[key] = truncateDescriptionFieldsDeep(child, depth - 1);
    }
  }
  return output;
}

/**
 * Obcina długie pola opisowe w wyniku `search_catalog`.
 * MCP zwraca często JSON jako tekst w `content[].text`; obsługujemy oba kształty.
 */
export function compactCatalogResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const root = result as Record<string, unknown>;
  const content = root.content;
  if (Array.isArray(content)) {
    const compactedContent = content.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const part = entry as Record<string, unknown>;
      if (typeof part.text === 'string') {
        const text = part.text;
        try {
          const parsed = JSON.parse(text);
          const compacted = truncateDescriptionFieldsDeep(parsed, 6);
          return { ...part, text: JSON.stringify(compacted) };
        } catch {
          return part;
        }
      }
      return truncateDescriptionFieldsDeep(part, 6);
    });
    return { ...root, content: compactedContent };
  }
  return truncateDescriptionFieldsDeep(root, 6);
}
