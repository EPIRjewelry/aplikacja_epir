/** Domyślny debounce revalidate po burście SSE commerce_action (ms). */
export const COMMERCE_REVALIDATE_DEBOUNCE_MS = 300;

export type RevalidateScheduler = {
  schedule: () => void;
  flush: () => void;
  cancel: () => void;
  getPendingCount: () => number;
  getFlushCount: () => number;
};

/**
 * Kolejkuje revalidate z debounce — wiele commerce_action w krótkim oknie → jeden flush.
 */
export function createRevalidateScheduler(
  revalidate: () => void,
  debounceMs: number = COMMERCE_REVALIDATE_DEBOUNCE_MS,
): RevalidateScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingCount = 0;
  let flushCount = 0;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flushCount += 1;
    revalidate();
  };

  return {
    schedule() {
      pendingCount += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flushCount += 1;
        revalidate();
      }, debounceMs);
    },
    flush,
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    getPendingCount: () => pendingCount,
    getFlushCount: () => flushCount,
  };
}
