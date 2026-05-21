/**
 * Normalizacja `created_at` z D1 `pixel_events` (INTEGER ms epoch lub ISO TEXT).
 */

/** Czas zdarzenia w ms od epoch; 0 jeśli brak / nieparsowalne. */
export function pixelCreatedAtMs(createdAt: unknown): number {
  if (createdAt == null || createdAt === '') return 0;
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
    return createdAt > 1e12 ? Math.floor(createdAt) : Math.floor(createdAt * 1000);
  }
  const s = String(createdAt).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? n : n * 1000;
  }
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pixelCreatedAtIso(createdAt: unknown): string {
  const ms = pixelCreatedAtMs(createdAt);
  return ms > 0 ? new Date(ms).toISOString() : new Date().toISOString();
}
