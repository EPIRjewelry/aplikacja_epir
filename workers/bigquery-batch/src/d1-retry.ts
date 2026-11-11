/**
 * Ograniczone ponowienie wywołań D1 — wyłącznie błędy przejściowe.
 *
 * Udokumentowana lista (dopasowanie po message / name, case-insensitive):
 * - `D1_ERROR: Network connection lost`
 * - `network connection lost`
 * - `overloaded` (`D1_ERROR: D1 DB is overloaded` i warianty)
 * - `D1_ERROR` + (`timeout` | `timed out` | `temporarily unavailable` | `internal error`)
 * - `storage caused exception` (CF transient)
 *
 * Nie ponawiamy: błędy SQL / logiki (syntax, constraint poza retryowanym upsertem,
 * missing table, UNIQUE poza ON CONFLICT, itp.).
 */

export const D1_TRANSIENT_ERROR_PATTERNS: readonly RegExp[] = [
  /network connection lost/i,
  /overloaded/i,
  /d1_error:.*\b(timeout|timed out|temporarily unavailable|internal error)\b/i,
  /storage caused exception/i,
];

export type D1RetryOptions = {
  /** Nazwa kroku do logów (np. `persist_operator_daily_report`). */
  step: string;
  maxAttempts?: number;
  /** Bazowe opóźnienie przed 1. retry (ms). Domyślnie 100. */
  baseDelayMs?: number;
  /** Wstrzyknięcie sleep (testy). */
  sleep?: (ms: number) => Promise<void>;
  /** Wstrzyknięcie RNG jittera (testy) — wartość w [0, 1). */
  random?: () => number;
  /** Gdy false — bez logów per próba (wołający zapisuje jedną linię). Domyślnie true. */
  log?: boolean;
  /** Ustawiane na numer bieżącej próby (1 = pierwsza). */
  stats?: { attempts: number };
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;

export function isTransientD1Error(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : String(error ?? '');
  return D1_TRANSIENT_ERROR_PATTERNS.some((re) => re.test(msg));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wykładnicze opóźnienie z jitterem: base * 2^(attempt-1) * (0.5 + random*0.5). */
export function computeD1RetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  random: () => number,
): number {
  const exp = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = 0.5 + random() * 0.5;
  return Math.round(exp * jitter);
}

/**
 * Wykonuje `fn` z ponowieniem tylko przy {@link isTransientD1Error}.
 * Po wyczerpaniu prób loguje ustrukturyzowany wpis i rzuca ostatni błąd.
 */
export async function withD1Retry<T>(fn: () => Promise<T>, opts: D1RetryOptions): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const log = opts.log !== false;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.stats) opts.stats.attempts = attempt;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const transient = isTransientD1Error(error);
      if (!transient || attempt >= maxAttempts) {
        if (log) {
          console.error(
            JSON.stringify({
              tag: 'd1_retry_exhausted',
              step: opts.step,
              attempt,
              maxAttempts,
              transient,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
        throw error;
      }
      const delayMs = computeD1RetryDelayMs(attempt, baseDelayMs, random);
      if (log) {
        console.warn(
          JSON.stringify({
            tag: 'd1_retry',
            step: opts.step,
            attempt,
            maxAttempts,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      await sleep(delayMs);
    }
  }

  throw lastError;
}
