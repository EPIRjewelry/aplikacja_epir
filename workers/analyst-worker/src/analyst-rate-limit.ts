/** Izolowany store na instancję workera (best-effort; przy wielu izolatach limit jest „miękki”). */
const RL_STORE = Symbol.for('epir.analyst.post.rl');

type TsStore = Map<string, number[]>;

function store(): TsStore {
  const g = globalThis as unknown as Record<symbol, TsStore>;
  if (!g[RL_STORE]) g[RL_STORE] = new Map();
  return g[RL_STORE];
}

/**
 * Sliding window po kluczu (np. CF-Connecting-IP) dla POST /v1/warehouse/query.
 * Zwraca 429 gdy przekroczono max żądań w oknie.
 */
export function checkPostWarehouseRateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const map = store();
  const now = Date.now();
  const k = key.trim() || 'unknown';
  const arr = map.get(k) ?? [];
  const pruned = arr.filter((t) => now - t < windowMs);
  if (pruned.length >= max) {
    const oldest = Math.min(...pruned);
    const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  pruned.push(now);
  map.set(k, pruned);
  return { ok: true };
}

/** Tylko dla Vitest — zeruje licznik między testami tej samej izolaty. */
export function __resetAnalystRateLimitForTests(): void {
  const g = globalThis as unknown as Record<symbol, TsStore | undefined>;
  g[RL_STORE] = undefined;
}
