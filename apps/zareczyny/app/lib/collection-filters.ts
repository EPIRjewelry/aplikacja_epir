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
    : [...nodes];
  const hub = hideHubHandle?.trim();
  if (hub) {
    out = out.filter((c) => c.handle !== hub);
  }
  if (allowedHandles?.length) {
    const order = new Map(allowedHandles.map((h, i) => [h, i]));
    out = [...out].sort(
      (a, b) => (order.get(a.handle) ?? 999) - (order.get(b.handle) ?? 999),
    );
  }
  return out;
}

/**
 * Pierwszy handle z listy dozwolonych, który istnieje w API (kolejność jak w COLLECTION_FILTER).
 * Opcjonalnie pomija hub, żeby /collections nie wpadało od razu w stronę zbiorczą.
 */
export function pickFirstAllowedCollectionHandle(params: {
  availableHandles: Set<string>;
  allowedHandles: string[] | null;
  skipHubHandle?: string | null;
}): string | undefined {
  const {availableHandles, allowedHandles, skipHubHandle} = params;
  const skip = skipHubHandle?.trim();
  const order = allowedHandles?.length
    ? allowedHandles
    : [...availableHandles];
  for (const h of order) {
    if (!availableHandles.has(h)) continue;
    if (skip && h === skip) continue;
    return h;
  }
  if (skip) {
    for (const h of order) {
      if (availableHandles.has(h)) return h;
    }
  }
  return undefined;
}
