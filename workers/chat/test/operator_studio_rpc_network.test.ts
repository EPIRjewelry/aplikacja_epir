import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config/bindings';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

function envWithFailingRpc(flowError: Error, insightsError: Error): Env {
  return {
    EPIR_OPERATOR_PANEL_SECRET: 'op-secret',
    BIGQUERY_BATCH_RPC: {
      getFlowHealth: async () => {
        throw flowError;
      },
      runAnalyticsQuery: async () => ({ ok: false, error: 'unused', status: 500 }),
      triggerWarehouseExport: async () => {
        throw new Error('unused');
      },
    },
    STORE_STEWARD_RPC: {
      runAggregation: async () => {
        throw new Error('unused');
      },
      getInsights: async () => {
        throw insightsError;
      },
      saveReport: async () => {
        throw new Error('unused');
      },
    },
  } as unknown as Env;
}

describe('operator studio RPC network connection lost', () => {
  it('maps BIGQUERY_BATCH_RPC.getFlowHealth "Network connection lost." to rpc_network_connection_lost', async () => {
    const env = envWithFailingRpc(
      new Error('Network connection lost.'),
      new Error('Network connection lost.'),
    );
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio/api/flow-health', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'op-secret' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok?: boolean;
      error?: string;
      message?: string;
      upstream?: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('rpc_network_connection_lost');
    expect(body.message).toBe('Network connection lost.');
    expect(body.upstream).toBe('BIGQUERY_BATCH_RPC.getFlowHealth');
  });

  it('maps STORE_STEWARD_RPC.getInsights D1 network drop to the same code', async () => {
    const env = envWithFailingRpc(
      new Error('Network connection lost.'),
      new Error('D1_ERROR: Network connection lost.'),
    );
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio/api/steward/insights', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'op-secret' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok?: boolean;
      error?: string;
      message?: string;
      upstream?: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('rpc_network_connection_lost');
    expect(body.message).toBe('D1_ERROR: Network connection lost.');
    expect(body.upstream).toBe('STORE_STEWARD_RPC.getInsights');
  });

  it('maps other RPC rejections to rpc_call_failed instead of a bare 500', async () => {
    const env = envWithFailingRpc(new Error('rpc:forbidden missing scope bigquery.analytics_query'), new Error('x'));
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio/api/flow-health', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'op-secret' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok?: boolean; error?: string; message?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('rpc_call_failed');
    expect(body.message).toContain('rpc:forbidden');
  });

  it('ready stays 200 when both RPC stubs would drop the connection', async () => {
    const env = envWithFailingRpc(
      new Error('Network connection lost.'),
      new Error('Network connection lost.'),
    );
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio/api/ready', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'op-secret' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; gates?: { bigqueryBatchRpc?: boolean } };
    expect(body.ok).toBe(true);
    expect(body.gates?.bigqueryBatchRpc).toBe(true);
  });
});
