import { describe, expect, it, vi } from 'vitest';
import {
  computeD1RetryDelayMs,
  isTransientD1Error,
  withD1Retry,
} from './d1-retry';

describe('isTransientD1Error', () => {
  it('recognizes Network connection lost', () => {
    expect(isTransientD1Error(new Error('D1_ERROR: Network connection lost.'))).toBe(true);
  });

  it('rejects SQL / logic errors', () => {
    expect(isTransientD1Error(new Error('D1_ERROR: no such table: operator_daily_reports'))).toBe(
      false,
    );
    expect(isTransientD1Error(new Error('UNIQUE constraint failed'))).toBe(false);
  });
});

describe('withD1Retry', () => {
  it('retries transient D1 then succeeds', async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const result = await withD1Retry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('D1_ERROR: Network connection lost.');
        return 'ok';
      },
      { step: 'test_step', sleep, random: () => 0, baseDelayMs: 10 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(computeD1RetryDelayMs(1, 10, () => 0));
  });

  it('does not retry non-transient errors', async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    await expect(
      withD1Retry(
        async () => {
          calls += 1;
          throw new Error('D1_ERROR: no such column: foo');
        },
        { step: 'test_step', sleep, random: () => 0 },
      ),
    ).rejects.toThrow(/no such column/);
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
