type HasHandle = {handle: string};

/**
 * Używane w root i stronie głównej: pokazuj w nav / siatce tylko kolekcje dozwolone przez
 * COLLECTION_FILTER, opcjonalnie z pominięciem kolekcji-hub (np. tylko linki do złotych i srebrnych).
 */
export function parseCollectionFilter(
  filter: string | undefined,
): string[] | null {
  if (!filter) return null;
  return filter
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
}

export function filterCollectionsForNav<T extends HasHandle>(params: {
  nodes: T[];
  allowedHandles: string[] | null;
  /** Handle kolekcji nadrzędnej (np. łączącej) — nie pokazuj jej obok kategorii produktów. */
  hideHubHandle?: string | null;
}): T[] {
  const {nodes, allowedHandles, hideHubHandle} = params;
  let out = allowedHandles?.length
    ? nodes.filter((c) => allowedHandles.includes(c.handle))
    : nodes;
  const hub = hideHubHandle?.trim();
  if (hub) {
    out = out.filter((c) => c.handle !== hub);
  }
  return out;
}
