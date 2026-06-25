import {describe, expect, it, vi, afterEach, beforeEach} from 'vitest';
import {
  COMMERCE_REVALIDATE_DEBOUNCE_MS,
  createRevalidateScheduler,
} from './schedule-revalidate';

describe('createRevalidateScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces multiple schedule calls into one revalidate', () => {
    const revalidate = vi.fn();
    const scheduler = createRevalidateScheduler(revalidate, 300);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(revalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(COMMERCE_REVALIDATE_DEBOUNCE_MS);

    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(scheduler.getFlushCount()).toBe(1);
    expect(scheduler.getPendingCount()).toBe(4);
  });

  it('flush() runs revalidate immediately', () => {
    const revalidate = vi.fn();
    const scheduler = createRevalidateScheduler(revalidate, 300);

    scheduler.schedule();
    scheduler.flush();

    expect(revalidate).toHaveBeenCalledTimes(1);
  });
});
