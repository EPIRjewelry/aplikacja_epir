/**
 * EDOG flow-health dla kanału operator (RPC → epir-bigquery-batch).
 */
import type { Env } from './config/bindings';

export async function getFlowHealthTool(env: Env): Promise<{
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}> {
  const rpc = env.BIGQUERY_BATCH_RPC;
  if (!rpc?.getFlowHealth) {
    return {
      error: {
        code: -32603,
        message: 'get_flow_health not configured (BIGQUERY_BATCH_RPC.getFlowHealth missing)',
      },
    };
  }
  try {
    const report = await rpc.getFlowHealth();
    return {
      result: {
        source: 'edog_flow_health',
        ...report,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: { code: -32000, message: msg } };
  }
}
