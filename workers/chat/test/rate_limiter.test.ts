import { describe, expect, it } from 'vitest';
import { RateLimiterDO } from '../src/rate-limiter';

function makeStateStub() {
  const data = new Map<string, unknown>();
  const state = {
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return data.get(key) as T | undefined;
      },
      async put<T>(key: string, value: T): Promise<void> {
        data.set(key, value);
      },
    },
    async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      return await fn();
    },
  } as unknown as DurableObjectState;

  return { state, data };
}

describe('RateLimiterDO persistence', () => {
  it('persists bucket state across DO re-instantiation', async () => {
    const { state } = makeStateStub();

    const firstInstance = new RateLimiterDO(state);
    const consumeFirst = await firstInstance.fetch(
      new Request('https://rate/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: 5 }),
      }),
    );
    expect(consumeFirst.status).toBe(200);

    const secondInstance = new RateLimiterDO(state);
    const checkResponse = await secondInstance.fetch(new Request('https://rate/check'));
    expect(checkResponse.status).toBe(200);
    const checkBody = (await checkResponse.json()) as { tokens: number; maxTokens: number };

    expect(checkBody.maxTokens).toBe(40);
    expect(checkBody.tokens).toBeLessThanOrEqual(35);
    expect(checkBody.tokens).toBeGreaterThanOrEqual(0);
  });

  it('preserves consume/check/reset semantics after rehydration', async () => {
    const { state } = makeStateStub();

    const firstInstance = new RateLimiterDO(state);
    const consumeResponse = await firstInstance.fetch(
      new Request('https://rate/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: 10 }),
      }),
    );
    expect(consumeResponse.status).toBe(200);
    const consumeBody = (await consumeResponse.json()) as { allowed: boolean; tokens: number };
    expect(consumeBody.allowed).toBe(true);
    expect(consumeBody.tokens).toBeLessThanOrEqual(30);
    expect(consumeBody.tokens).toBeGreaterThanOrEqual(0);

    const secondInstance = new RateLimiterDO(state);
    const rehydratedCheck = await secondInstance.fetch(new Request('https://rate/check'));
    expect(rehydratedCheck.status).toBe(200);
    const rehydratedCheckBody = (await rehydratedCheck.json()) as { tokens: number };
    expect(rehydratedCheckBody.tokens).toBeLessThanOrEqual(consumeBody.tokens);
    expect(rehydratedCheckBody.tokens).toBeGreaterThanOrEqual(0);

    const consumeAfterRehydrate = await secondInstance.fetch(
      new Request('https://rate/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: 5 }),
      }),
    );
    expect(consumeAfterRehydrate.status).toBe(200);
    const consumeAfterRehydrateBody = (await consumeAfterRehydrate.json()) as { allowed: boolean; tokens: number };
    expect(consumeAfterRehydrateBody.allowed).toBe(true);
    expect(consumeAfterRehydrateBody.tokens).toBeLessThanOrEqual(rehydratedCheckBody.tokens);
    expect(consumeAfterRehydrateBody.tokens).toBeGreaterThanOrEqual(0);

    const resetResponse = await secondInstance.fetch(new Request('https://rate/reset'));
    expect(resetResponse.status).toBe(200);
    const resetBody = (await resetResponse.json()) as { reset: boolean; tokens: number };
    expect(resetBody.reset).toBe(true);
    expect(resetBody.tokens).toBe(40);

    const thirdInstance = new RateLimiterDO(state);
    const checkAfterReset = await thirdInstance.fetch(new Request('https://rate/check'));
    expect(checkAfterReset.status).toBe(200);
    const checkAfterResetBody = (await checkAfterReset.json()) as { tokens: number; maxTokens: number };
    expect(checkAfterResetBody.maxTokens).toBe(40);
    expect(checkAfterResetBody.tokens).toBe(40);
  });
});
