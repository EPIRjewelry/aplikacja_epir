import { describe, expect, it } from 'vitest';
import { buildFlowHealthReport } from './edog-flow-health-runner';
import { withD1Retry } from './d1-retry';

/**
 * Mirrors `BigQueryBatchS2SRpc.getFlowHealth` (workers/bigquery-batch/src/index.ts):
 * `withD1Retry(() => buildFlowHealthReport(...), { step: 'get_flow_health' })`
 * with no catch. A persistent D1 "Network connection lost." therefore rejects the RPC.
 */
function d1ThatDropsConnection(): D1Database {
  const message = 'D1_ERROR: Network connection lost.';
  const statement = {
    bind() {
      return statement;
    },
    async first() {
      throw new Error(message);
    },
    async all() {
      throw new Error(message);
    },
    async run() {
      throw new Error(message);
    },
  };
  return {
    prepare() {
      return statement;
    },
  } as unknown as D1Database;
}

describe('getFlowHealth RPC error', () => {
  it('lets a persistent D1 Network connection lost escape the getFlowHealth retry wrapper', async () => {
    const env = {
      DB: d1ThatDropsConnection(),
      DB_CHATBOT: d1ThatDropsConnection(),
    };
    await expect(
      withD1Retry(() => buildFlowHealthReport(env, async () => ({ rowCount: null, skipped: true })), {
        step: 'get_flow_health',
        maxAttempts: 2,
        sleep: async () => {},
        random: () => 0,
        log: false,
      }),
    ).rejects.toThrow(/Network connection lost/);
  });
});
