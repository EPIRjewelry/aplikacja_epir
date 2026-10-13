import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiGatewayHttpError } from '../src/ai-client';
import { BuyerTurnOverloadError, withLlmRound0Retry } from '../src/buyer/buyer-llm-retry';

describe('withLlmRound0Retry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once on 429 with Retry-After then succeeds', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new AiGatewayHttpError(429, 2);
      }
      return 'ok';
    });
    const p = withLlmRound0Retry(0, fn);
    await vi.advanceTimersByTimeAsync(2500);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws BuyerTurnOverloadError after two 429s in round 0', async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => {
      throw new AiGatewayHttpError(429, 1);
    });
    const p = withLlmRound0Retry(0, fn);
    const assertion = expect(p).rejects.toBeInstanceOf(BuyerTurnOverloadError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('caps Retry-After wait at 10s', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new AiGatewayHttpError(429, 120);
      return 1;
    });
    const p = withLlmRound0Retry(0, fn);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toBe(1);
  });
});
