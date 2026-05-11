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
});
