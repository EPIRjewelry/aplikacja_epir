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
/** Milisekundy od epoch — ISO z ułamkową sekundą przez julianday (bez obcinania do sekundy). */
export const PIXEL_CREATED_AT_MS_SQL = `(
  CASE
    WHEN typeof(created_at) IN ('integer', 'real') THEN CAST(created_at AS INTEGER)
    WHEN typeof(created_at) = 'text' AND created_at NOT LIKE '%-%' AND created_at GLOB '[0-9]*'
      THEN CAST(created_at AS INTEGER)
    ELSE CAST((julianday(created_at) - 2440587.5) * 86400000.0 AS INTEGER)
  END
)`;

/** Porównanie kursora eksportu: (ms, id) leksykograficznie. */
export const PIXEL_ID_TEXT_SQL = `CAST(id AS TEXT)`;

export function pixelExportCursorWhereSql(): string {
  return `(
    (${PIXEL_CREATED_AT_MS_SQL}) > ?1
    OR ((${PIXEL_CREATED_AT_MS_SQL}) = ?1 AND ${PIXEL_ID_TEXT_SQL} > ?2)
  )`;
}

export function pixelExportOrderBySql(): string {
  return `${PIXEL_CREATED_AT_MS_SQL} ASC, ${PIXEL_ID_TEXT_SQL} ASC`;
}

export function rowExportCursorMsId(row: Record<string, unknown>): { ms: number; id: string } {
  return {
    ms: pixelCreatedAtMs(row.created_at),
    id: String(row.id ?? ''),
  };
}
