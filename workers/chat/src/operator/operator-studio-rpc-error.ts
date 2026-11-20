/**
 * Operator Studio RPC failures (flow-health, steward/insights).
 *
 * "Network connection lost." is the Workers runtime message when a service-binding
 * RPC session drops (callee isolate killed, entrypoint missing, or the call
 * aborted). The same phrase is inside D1's `D1_ERROR: Network connection lost.`,
 * which `BigQueryBatchS2SRpc.getFlowHealth` rethrows after `withD1Retry` and
 * which `StoreStewardS2SRpc.getInsights` does not catch.
 */

export type OperatorStudioRpcUpstream =
  | 'BIGQUERY_BATCH_RPC.getFlowHealth'
  | 'STORE_STEWARD_RPC.getInsights';

export type OperatorStudioRpcErrorCode = 'rpc_network_connection_lost' | 'rpc_call_failed';

export type OperatorStudioRpcErrorBody = {
  ok: false;
  error: OperatorStudioRpcErrorCode;
  message: string;
  upstream: OperatorStudioRpcUpstream;
};

const NETWORK_CONNECTION_LOST = /network connection lost/i;

export function operatorStudioRpcErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function operatorStudioRpcErrorBody(
  error: unknown,
  upstream: OperatorStudioRpcUpstream,
): OperatorStudioRpcErrorBody {
  const message = operatorStudioRpcErrorMessage(error);
  return {
    ok: false,
    error: NETWORK_CONNECTION_LOST.test(message) ? 'rpc_network_connection_lost' : 'rpc_call_failed',
    message,
    upstream,
  };
}

export function operatorStudioRpcFailureResponse(
  error: unknown,
  upstream: OperatorStudioRpcUpstream,
  extraHeaders: Record<string, string>,
): Response {
  const body = operatorStudioRpcErrorBody(error, upstream);
  console.error(
    JSON.stringify({
      tag: 'operator_studio_rpc_failed',
      upstream: body.upstream,
      error: body.error,
      message: body.message,
    }),
  );
  const status = body.error === 'rpc_network_connection_lost' ? 503 : 502;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
