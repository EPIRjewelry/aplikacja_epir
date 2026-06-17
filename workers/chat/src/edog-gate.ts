/**
 * Bramka EDOG przed run_analytics_query (kanał operator).
 * Odczyt flow-health przez BIGQUERY_BATCH_RPC.getFlowHealth (S2S).
 */
import type { Env } from './config/bindings';

export type EdogGateResult =
  | { allowed: true; verdict: 'PASS' }
  | { allowed: false; verdict: string; reasons: string[]; message: string };

type FlowHealthRpc = {
  getFlowHealth?: () => Promise<{
    edog_verdict: 'PASS' | 'FAIL' | 'DEGRADED';
    reasons: string[];
    checked_at?: string;
  }>;
};

let cached: { at: number; verdict: string; reasons: string[] } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function gateDisabled(env: Env): boolean {
  const flag = (env.EDOG_GATE_ENABLED ?? 'false').trim().toLowerCase();
  return flag === 'false' || flag === '0' || flag === 'off';
}

export async function checkEdogGateForWarehouse(env: Env): Promise<EdogGateResult> {
  if (gateDisabled(env)) {
    return { allowed: true, verdict: 'PASS' };
  }

  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    if (cached.verdict === 'PASS') {
      return { allowed: true, verdict: 'PASS' };
    }
    return {
      allowed: false,
      verdict: cached.verdict,
      reasons: cached.reasons,
      message: edogBlockedMessage(cached.verdict, cached.reasons),
    };
  }

  const rpc = env.BIGQUERY_BATCH_RPC as FlowHealthRpc | undefined;
  if (!rpc?.getFlowHealth) {
    return {
      allowed: false,
      verdict: 'FAIL',
      reasons: ['bigquery_batch_rpc_getFlowHealth_missing'],
      message:
        'EDOG: bramka niedostępna (zdeployuj epir-bigquery-batch z getFlowHealth i epir-art-jewellery-worker). run_analytics_query zablokowane.',
    };
  }

  try {
    const report = await rpc.getFlowHealth();
    cached = { at: now, verdict: report.edog_verdict, reasons: report.reasons ?? [] };
    if (report.edog_verdict === 'PASS') {
      return { allowed: true, verdict: 'PASS' };
    }
    return {
      allowed: false,
      verdict: report.edog_verdict,
      reasons: report.reasons ?? [],
      message: edogBlockedMessage(report.edog_verdict, report.reasons ?? []),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      allowed: false,
      verdict: 'FAIL',
      reasons: [`flow_health_error:${msg.slice(0, 120)}`],
      message: `EDOG: nie udało się odczytać flow-health (${msg.slice(0, 200)}). run_analytics_query zablokowane.`,
    };
  }
}

function edogBlockedMessage(verdict: string, reasons: string[]): string {
  return `EDOG: ${verdict} — hurtownia tymczasowo niedostępna (${reasons.join('; ')}). Użyj trybu data_flow_audit lub napraw pipeline, potem ponów.`;
}
