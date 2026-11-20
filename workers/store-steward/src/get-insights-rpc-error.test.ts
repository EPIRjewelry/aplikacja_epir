import { describe, expect, it } from 'vitest';
import { getLatestPeriod } from './pipeline';

/**
 * `StoreStewardS2SRpc.getInsights` (src/rpc.ts) calls `getLatestPeriod(this.env.DB)`
 * with no try/catch when the request has no period. A D1 drop rejects the RPC.
 */
describe('getInsights RPC error', () => {
  it('propagates D1 Network connection lost from the latest-period read', async () => {
    const message = 'D1_ERROR: Network connection lost.';
    const statement = {
      bind() {
        return statement;
      },
      async first() {
        throw new Error(message);
      },
    };
    const db = {
      prepare() {
        return statement;
      },
    } as unknown as D1Database;

    await expect(getLatestPeriod(db)).rejects.toThrow(/Network connection lost/);
  });
});
