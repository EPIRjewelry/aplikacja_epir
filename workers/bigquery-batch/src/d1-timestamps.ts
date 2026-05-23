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

/**
 * Wyrażenie SQLite (D1) — `created_at` w ms, tak jak `pixelCreatedAtMs` w TS.
 * D1 ma mieszane typy: starsze wiersze (INTEGER ms), nowe (ISO TEXT).
 */
export const PIXEL_CREATED_AT_MS_SQL = `(
  CASE
    WHEN typeof(created_at) IN ('integer', 'real') THEN CAST(created_at AS INTEGER)
    WHEN created_at GLOB '[0-9]*' THEN CAST(created_at AS INTEGER)
    ELSE CAST(unixepoch(created_at) AS INTEGER) * 1000
  END
)`;
