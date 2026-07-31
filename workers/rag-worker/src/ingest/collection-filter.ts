/** CSV handles z wrangler [vars] KAZKA_COLLECTION_FILTER */
export function parseCollectionFilter(filter: string | undefined): string[] {
  if (!filter?.trim()) return [];
  return filter
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
}

export function unionCollectionsByHandle<T extends {handle: string}>(
  ...lists: T[][]
): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      if (item?.handle && !map.has(item.handle)) {
        map.set(item.handle, item);
      }
    }
  }
  return [...map.values()];
}
