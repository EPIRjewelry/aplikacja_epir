/**
 * EDOG fleet orchestrator (NB-01 / Opcja C — Local Runtime only).
 * DAG: dataFlowAuditor || typeValidator → aggregate → audit_report.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Agent,
  AgentBusyError,
  ConfigurationError,
  Cursor,
  CursorAgentError,
  IntegrationNotConnectedError,
  UnsupportedRunOperationError,
  type McpServerConfig,
  type RunResult,
  type SettingSource,
} from '@cursor/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load `agents/data_guardian/.env` into process.env (does not override existing vars). */
function loadDotEnv(): void {
  const envPath = path.join(__dirname, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

/** Pin via `EDOG_AUDITOR_MODEL_ID` or `Cursor.models.list()` (e.g. Claude Sonnet). */
const DEFAULT_MODEL_ID = 'claude-4-sonnet';

type SubagentStatus =
  | 'finished'
  | 'run_failed'
  | 'startup_failed'
  | 'busy'
  | 'unsupported'
  | 'mcp_not_connected';

type SubagentReport = {
  status: SubagentStatus;
  runId?: string;
  error?: string;
  isRetryable?: boolean;
  resultPreview?: string;
};

type FlowHealthPayload = {
  edog_verdict?: 'PASS' | 'FAIL' | 'DEGRADED';
  reasons?: string[];
  [key: string]: unknown;
};

export type AuditReport = {
  checked_at: string;
  runtime: 'local';
  repo_root: string;
  model_id: string;
  subagents: {
    dataFlowAuditor: SubagentReport;
    typeValidator: SubagentReport;
  };
  flow_health: FlowHealthPayload | null;
  flow_health_fetch_error?: string;
  gate_signature: 'EDOG: PASS' | 'EDOG: FAIL';
  reasons: string[];
};

function repoRoot(): string {
  const fromEnv = process.env.EPIR_REPO_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(__dirname, '..', '..');
}

function requireApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) {
    throw new ConfigurationError('CURSOR_API_KEY is required');
  }
  return key;
}

function pickMcpEnv(): Record<string, string> {
  const keys = [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_TOKEN',
    'EPIR_BATCH_WORKER_ORIGIN',
    'DATA_GUARDIAN_OPS_KEY',
    'EPIR_ANALYST_WORKER_ORIGIN',
    'ANALYST_HTTP_BEARER',
  ] as const;
  const env: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) env[k] = v;
  }
  return env;
}

function buildEpirDataOpsMcp(root: string): Record<string, McpServerConfig> {
  return {
    'epir-data-ops': {
      type: 'stdio',
      command: 'npx',
      args: ['tsx', 'mcp-servers/epir-data-ops/src/index.ts'],
      cwd: root,
      env: pickMcpEnv(),
    },
  };
}

async function resolveModelId(apiKey: string): Promise<string> {
  const pinned = process.env.EDOG_AUDITOR_MODEL_ID?.trim();
  if (pinned) return pinned;

  try {
    const models = await Cursor.models.list({ apiKey });
    const preferred = [
      'claude-4.6-sonnet',
      'claude-4-sonnet',
      'claude-sonnet-4',
      'sonnet',
    ];
    for (const needle of preferred) {
      const hit = models.find(
        m =>
          m.id.toLowerCase().includes(needle) ||
          m.aliases?.some(a => a.toLowerCase().includes(needle)),
      );
      if (hit) return hit.id;
    }
    const sonnet = models.find(m => /sonnet/i.test(m.displayName) || /sonnet/i.test(m.id));
    if (sonnet) return sonnet.id;
  } catch {
    /* fall through */
  }
  return DEFAULT_MODEL_ID;
}

function localAgentOptions(root: string, apiKey: string, modelId: string) {
  return {
    apiKey,
    model: { id: modelId },
    local: {
      cwd: root,
      settingSources: [] as SettingSource[],
    },
  };
}

const PROMPT_DATA_FLOW = `Jesteś EDOG Data Flow Auditor (read-only).

Użyj MCP epir-data-ops:
1. flow_health_summary
2. d1_metadata dla database jewelry_analytics, tabele pixel_events i batch_exports
3. opcjonalnie warehouse_probe (Q1) gdy flow-health wskazuje zdrowy batch

Porównaj liczność zdarzeń D1 (24h, pending) z lagiem eksportu do magazynu R2 (batch_exports.updated_at).
Magazyn docelowy to wyłącznie R2/R2 SQL — nie używaj nazwy BigQuery.

Zwróć zwięzły JSON z polami: layers, flow_health (skrót), reasons, edog_verdict_api.
Na końcu odpowiedzi jedna linia: EDOG: PASS lub EDOG: FAIL (DEGRADED z API = FAIL).`;

const PROMPT_TYPE_VALIDATOR = `Jesteś EDOG Local Code & Type Validator.

1. W katalogu mcp-servers/epir-data-ops uruchom: npx tsc --noEmit
2. Przeczytaj workers/analytics/src/cqrs/types.ts i docs/EPIR_ANALYTICS_DATA_CONTRACT.md
3. Oceń spójność kontraktu CQRS (R2 SQL, D1, KV) — bez surowego odczytu D1.

Zwróć JSON: { "tsc_exit_ok": boolean, "contract_ok": boolean, "notes": string[] }.
Jeśli tsc lub kontrakt nie przechodzi — zakończ linią EDOG: FAIL, inaczej EDOG: PASS.`;

function mapRunResult(result: RunResult, label: string): SubagentReport {
  if (result.status === 'error') {
    return {
      status: 'run_failed',
      runId: result.id,
      error: `${label}: run status error`,
      resultPreview: result.result?.slice(0, 500),
    };
  }
  return {
    status: 'finished',
    runId: result.id,
    resultPreview: result.result?.slice(0, 500),
  };
}

function mapThrownError(err: unknown, label: string): SubagentReport {
  if (err instanceof IntegrationNotConnectedError) {
    return {
      status: 'mcp_not_connected',
      error: err.message,
      isRetryable: err.isRetryable,
    };
  }
  if (err instanceof AgentBusyError) {
    return {
      status: 'busy',
      error: err.message,
      isRetryable: err.isRetryable,
    };
  }
  if (err instanceof UnsupportedRunOperationError) {
    return {
      status: 'unsupported',
      error: err.message,
      isRetryable: err.isRetryable,
    };
  }
  if (err instanceof CursorAgentError) {
    return {
      status: 'startup_failed',
      error: `${label}: ${err.message}`,
      isRetryable: err.isRetryable,
    };
  }
  return {
    status: 'startup_failed',
    error: `${label}: ${err instanceof Error ? err.message : String(err)}`,
  };
}

async function runSubagent(
  prompt: string,
  label: 'dataFlowAuditor' | 'typeValidator',
  root: string,
  apiKey: string,
  modelId: string,
  mcp?: Record<string, McpServerConfig>,
): Promise<SubagentReport> {
  try {
    const result = await Agent.prompt(prompt, {
      ...localAgentOptions(root, apiKey, modelId),
      ...(mcp ? { mcpServers: mcp } : {}),
    });
    return mapRunResult(result, label);
  } catch (err) {
    return mapThrownError(err, label);
  }
}

async function fetchFlowHealth(): Promise<{
  payload: FlowHealthPayload | null;
  error?: string;
}> {
  const origin = process.env.EPIR_BATCH_WORKER_ORIGIN?.trim();
  const key = process.env.DATA_GUARDIAN_OPS_KEY?.trim();
  if (!origin || !key) {
    return {
      payload: null,
      error: 'missing EPIR_BATCH_WORKER_ORIGIN or DATA_GUARDIAN_OPS_KEY',
    };
  }
  const url = `${origin.replace(/\/$/, '')}/internal/flow-health`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await res.text();
    if (!res.ok) {
      return { payload: null, error: `flow-health HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = text.startsWith('{') ? (JSON.parse(text) as FlowHealthPayload) : { raw: text };
    return { payload: body };
  } catch (e) {
    return {
      payload: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function gateFromFlowHealth(payload: FlowHealthPayload | null): {
  signature: 'EDOG: PASS' | 'EDOG: FAIL';
  reasons: string[];
} {
  if (!payload?.edog_verdict) {
    return { signature: 'EDOG: FAIL', reasons: ['flow_health_unavailable'] };
  }
  if (payload.edog_verdict === 'PASS') {
    return {
      signature: 'EDOG: PASS',
      reasons: payload.reasons?.length ? payload.reasons : ['ok'],
    };
  }
  return {
    signature: 'EDOG: FAIL',
    reasons: payload.reasons?.length
      ? payload.reasons
      : [`edog_verdict_${payload.edog_verdict}`],
  };
}

function subagentFailed(report: SubagentReport): boolean {
  return report.status !== 'finished';
}

export async function runAudit(): Promise<AuditReport> {
  const root = repoRoot();
  const apiKey = requireApiKey();
  const modelId = await resolveModelId(apiKey);
  const mcp = buildEpirDataOpsMcp(root);

  const [dataFlowAuditor, typeValidator, flowFetch] = await Promise.all([
    runSubagent(PROMPT_DATA_FLOW, 'dataFlowAuditor', root, apiKey, modelId, mcp),
    runSubagent(PROMPT_TYPE_VALIDATOR, 'typeValidator', root, apiKey, modelId),
    fetchFlowHealth(),
  ]);

  const { signature: flowSignature, reasons: flowReasons } = gateFromFlowHealth(
    flowFetch.payload,
  );

  const reasons = [...flowReasons];
  let gate_signature: 'EDOG: PASS' | 'EDOG: FAIL' = flowSignature;

  if (subagentFailed(dataFlowAuditor)) {
    gate_signature = 'EDOG: FAIL';
    reasons.push(`dataFlowAuditor:${dataFlowAuditor.status}`);
  }
  if (subagentFailed(typeValidator)) {
    gate_signature = 'EDOG: FAIL';
    reasons.push(`typeValidator:${typeValidator.status}`);
  }
  if (flowFetch.error) {
    gate_signature = 'EDOG: FAIL';
    reasons.push(`flow_health_fetch:${flowFetch.error}`);
  }

  const report: AuditReport = {
    checked_at: new Date().toISOString(),
    runtime: 'local',
    repo_root: root,
    model_id: modelId,
    subagents: { dataFlowAuditor, typeValidator },
    flow_health: flowFetch.payload,
    ...(flowFetch.error ? { flow_health_fetch_error: flowFetch.error } : {}),
    gate_signature,
    reasons,
  };

  const outPath = path.join(__dirname, 'audit_report.json');
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function main(): Promise<void> {
  try {
    const report = await runAudit();
    console.log(report.gate_signature);
    console.log(JSON.stringify({ reasons: report.reasons }, null, 2));
    process.exit(report.gate_signature === 'EDOG: PASS' ? 0 : 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  void main();
}
