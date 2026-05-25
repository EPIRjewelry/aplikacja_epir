/**
 * EDOG fleet orchestrator v2.
 * Deterministic core (always local): auto-remediation → flow-health → MCP + tsc.
 * LLM layer (optional): Cursor cloud/local (data flow only) | OpenRouter | off.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import OpenAI from 'openai';
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

const PENDING_REMEDIATE_THRESHOLD = 1000;
const MAX_EXPORT_RUNS = 30;
const MAX_PIXEL_ROWS_PER_RUN = 2500;
const DEFAULT_MODEL_ID = 'claude-4-sonnet';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

type LlmProvider = 'cursor' | 'openrouter' | 'off';
type CursorTarget = 'cloud' | 'local';

type SubagentStatus =
  | 'finished'
  | 'skipped'
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
  pending_pixel_events?: number;
  pipeline_pixel_configured?: boolean;
  [key: string]: unknown;
};

type RemediationRun = {
  run: number;
  ok: boolean;
  rows_exported?: number;
  partial?: boolean;
  error?: string;
};

export type RemediationResult = {
  attempted: boolean;
  runs: RemediationRun[];
  stopped_reason: string;
};

export type DeterministicCore = {
  tsc_exit_code: number;
  tsc_ok: boolean;
  mcp: Record<string, { ok: boolean; preview?: string; error?: string }>;
};

export type AuditReport = {
  checked_at: string;
  repo_root: string;
  llm_provider: LlmProvider;
  cursor_target?: CursorTarget;
  model_id?: string;
  openrouter_model?: string;
  remediation: RemediationResult;
  deterministic: DeterministicCore;
  flow_health_before: FlowHealthPayload | null;
  flow_health: FlowHealthPayload | null;
  flow_health_fetch_error?: string;
  subagents: {
    dataFlowAuditor: SubagentReport;
    typeValidator: SubagentReport;
  };
  llm_comment_preview?: string;
  gate_signature: 'EDOG: PASS' | 'EDOG: FAIL';
  reasons: string[];
};

export type OrchestratorConfig = {
  llmProvider: LlmProvider;
  cursorTarget: CursorTarget;
};

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

function repoRoot(): string {
  const fromEnv = process.env.EPIR_REPO_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(__dirname, '..', '..');
}

function parseOrchestratorConfig(): OrchestratorConfig {
  const args = process.argv.slice(2);
  let providerArg: string | undefined;
  let targetArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && args[i + 1]) providerArg = args[++i];
    if (args[i] === '--cursor-target' && args[i + 1]) targetArg = args[++i];
  }

  const rawProvider = (providerArg ?? process.env.EDOG_LLM_PROVIDER ?? 'cursor')
    .trim()
    .toLowerCase();
  const llmProvider: LlmProvider =
    rawProvider === 'openrouter' || rawProvider === 'off' ? rawProvider : 'cursor';

  const rawTarget = (targetArg ?? process.env.EDOG_CURSOR_TARGET ?? 'cloud')
    .trim()
    .toLowerCase();
  const cursorTarget: CursorTarget = rawTarget === 'local' ? 'local' : 'cloud';

  return { llmProvider, cursorTarget };
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

function requireCursorApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) throw new ConfigurationError('CURSOR_API_KEY is required for EDOG_LLM_PROVIDER=cursor');
  return key;
}

async function resolveModelId(apiKey: string): Promise<string> {
  const pinned = process.env.EDOG_AUDITOR_MODEL_ID?.trim();
  if (pinned) return pinned;
  try {
    const models = await Cursor.models.list({ apiKey });
    const preferred = ['claude-4.6-sonnet', 'claude-4-sonnet', 'claude-sonnet-4', 'sonnet'];
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

function resolveOpenRouterModel(): string {
  return process.env.EDOG_OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

async function fetchFlowHealth(): Promise<{
  payload: FlowHealthPayload | null;
  error?: string;
}> {
  const origin = process.env.EPIR_BATCH_WORKER_ORIGIN?.trim();
  const key = process.env.DATA_GUARDIAN_OPS_KEY?.trim();
  if (!origin || !key) {
    return { payload: null, error: 'missing EPIR_BATCH_WORKER_ORIGIN or DATA_GUARDIAN_OPS_KEY' };
  }
  const url = `${origin.replace(/\/$/, '')}/internal/flow-health`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const text = await res.text();
    if (!res.ok) {
      return { payload: null, error: `flow-health HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = text.startsWith('{') ? (JSON.parse(text) as FlowHealthPayload) : { raw: text };
    return { payload: body };
  } catch (e) {
    return { payload: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function triggerExport(): Promise<{
  ok: boolean;
  rows_exported?: number;
  partial?: boolean;
  error?: string;
}> {
  const origin = process.env.EPIR_BATCH_WORKER_ORIGIN?.trim();
  const key = process.env.DATA_GUARDIAN_OPS_KEY?.trim();
  if (!origin || !key) return { ok: false, error: 'missing batch origin or ops key' };
  const url = `${origin.replace(/\/$/, '')}/internal/trigger-export`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ max_rows: MAX_PIXEL_ROWS_PER_RUN }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    const body = text.startsWith('{') ? (JSON.parse(text) as Record<string, unknown>) : {};
    return {
      ok: body.ok === true,
      rows_exported: typeof body.rows_exported === 'number' ? body.rows_exported : undefined,
      partial: body.partial === true,
      error: body.ok === true ? undefined : String(body.error ?? 'export_not_ok'),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function shouldRemediate(payload: FlowHealthPayload | null): boolean {
  if (!payload) return false;
  if (payload.pipeline_pixel_configured === false) return false;
  const pending = Number(payload.pending_pixel_events ?? -1);
  if (!Number.isFinite(pending) || pending < 0) return false;
  return pending >= PENDING_REMEDIATE_THRESHOLD;
}

export async function runAutoRemediation(
  initial: FlowHealthPayload | null,
): Promise<RemediationResult> {
  if (!shouldRemediate(initial)) {
    return { attempted: false, runs: [], stopped_reason: 'not_needed' };
  }

  const runs: RemediationRun[] = [];
  let stopped_reason = 'max_runs';

  for (let run = 1; run <= MAX_EXPORT_RUNS; run++) {
    const result = await triggerExport();
    runs.push({
      run,
      ok: result.ok,
      rows_exported: result.rows_exported,
      partial: result.partial,
      error: result.error,
    });
    if (!result.ok) {
      stopped_reason = 'export_error';
      break;
    }

    const health = await fetchFlowHealth();
    const pending = Number(health.payload?.pending_pixel_events ?? -1);
    if (health.payload?.edog_verdict === 'PASS') {
      stopped_reason = 'pass';
      break;
    }
    if (pending >= 0 && pending < PENDING_REMEDIATE_THRESHOLD) {
      stopped_reason = 'pending_below_threshold';
      break;
    }
    if (result.rows_exported === 0 && !result.partial) {
      stopped_reason = 'no_rows';
      break;
    }
  }

  return { attempted: true, runs, stopped_reason };
}

function runTsc(root: string): Promise<number> {
  const mcpDir = path.join(root, 'mcp-servers', 'epir-data-ops');
  return new Promise(resolve => {
    const child = spawn('npx', ['tsc', '--noEmit'], {
      cwd: mcpDir,
      shell: process.platform === 'win32',
      stdio: 'ignore',
    });
    child.on('close', code => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function withMcpClient<T>(
  root: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'mcp-servers/epir-data-ops/src/index.ts'],
    cwd: root,
    env: { ...process.env, ...pickMcpEnv() } as Record<string, string>,
  });
  const client = new Client({ name: 'edog-orchestrator', version: '0.2.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function mcpTextContent(result: unknown): string {
  if (!result || typeof result !== 'object') return String(result);
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  if (!Array.isArray(content)) return JSON.stringify(result).slice(0, 2000);
  return content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text)
    .join('\n')
    .slice(0, 2000);
}

export async function runDeterministicCore(root: string): Promise<DeterministicCore> {
  const tsc_exit_code = await runTsc(root);
  const mcp: DeterministicCore['mcp'] = {};

  const toolCalls: Array<{ key: string; name: string; args: Record<string, unknown> }> = [
    { key: 'flow_health_summary', name: 'flow_health_summary', args: {} },
    {
      key: 'd1_pixel_events',
      name: 'd1_metadata',
      args: { database: 'jewelry_analytics', table: 'pixel_events' },
    },
    {
      key: 'd1_batch_exports',
      name: 'd1_metadata',
      args: { database: 'jewelry_analytics', table: 'batch_exports' },
    },
  ];

  try {
    await withMcpClient(root, async client => {
      for (const { key, name, args } of toolCalls) {
        try {
          const out = await client.callTool({ name, arguments: args });
          mcp[key] = { ok: !out.isError, preview: mcpTextContent(out) };
        } catch (e) {
          mcp[key] = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
    });
  } catch (e) {
    mcp._connect = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { tsc_exit_code, tsc_ok: tsc_exit_code === 0, mcp };
}

function gateFromFlowHealth(payload: FlowHealthPayload | null): {
  signature: 'EDOG: PASS' | 'EDOG: FAIL';
  reasons: string[];
} {
  if (!payload?.edog_verdict) {
    return { signature: 'EDOG: FAIL', reasons: ['flow_health_unavailable'] };
  }
  if (payload.edog_verdict === 'PASS') {
    return { signature: 'EDOG: PASS', reasons: payload.reasons?.length ? payload.reasons : ['ok'] };
  }
  return {
    signature: 'EDOG: FAIL',
    reasons: payload.reasons?.length
      ? payload.reasons
      : [`edog_verdict_${payload.edog_verdict}`],
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
    return { status: 'mcp_not_connected', error: err.message, isRetryable: err.isRetryable };
  }
  if (err instanceof AgentBusyError) {
    return { status: 'busy', error: err.message, isRetryable: err.isRetryable };
  }
  if (err instanceof UnsupportedRunOperationError) {
    return {
      status: 'unsupported',
      error: `${label}: ${err.message} (cloud cannot run tsc — deterministic core runs locally)`,
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

async function runCursorDataFlowAuditor(
  root: string,
  apiKey: string,
  modelId: string,
  target: CursorTarget,
): Promise<SubagentReport> {
  const mcp = buildEpirDataOpsMcp(root);
  const base = { apiKey, model: { id: modelId }, mcpServers: mcp };
  try {
    const result =
      target === 'local'
        ? await Agent.prompt(PROMPT_DATA_FLOW, {
            ...base,
            local: { cwd: root, settingSources: [] as SettingSource[] },
          })
        : await Agent.prompt(PROMPT_DATA_FLOW, {
            ...base,
            cloud: {
              repos: [
                {
                  url: 'https://github.com/EPIRjewelry/aplikacja_epir',
                  startingRef: 'main',
                },
              ],
            },
          });
    return mapRunResult(result, 'dataFlowAuditor');
  } catch (err) {
    return mapThrownError(err, 'dataFlowAuditor');
  }
}

async function runOpenRouterComment(
  root: string,
  context: {
    flowHealth: FlowHealthPayload | null;
    remediation: RemediationResult;
    deterministic: DeterministicCore;
  },
): Promise<{ preview?: string; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return { error: 'OPENROUTER_API_KEY missing' };
  const model = resolveOpenRouterModel();
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/EPIRjewelry/aplikacja_epir',
      'X-Title': 'EDOG Data Guardian',
    },
  });
  const prompt = `Jesteś EDOG Data Flow Auditor (read-only). Repo: ${root}.
Na podstawie poniższego JSON (flow-health, remediacja, MCP, tsc) podaj zwięzły audyt i linię EDOG: PASS lub EDOG: FAIL.

${JSON.stringify(context, null, 2).slice(0, 12000)}`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    return { preview: text.slice(0, 500) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function typeValidatorFromTsc(det: DeterministicCore): SubagentReport {
  if (det.tsc_ok) {
    return {
      status: 'finished',
      resultPreview: `tsc exit 0; mcp keys: ${Object.keys(det.mcp).join(',')}`,
    };
  }
  return {
    status: 'run_failed',
    error: `tsc exit ${det.tsc_exit_code}`,
    resultPreview: 'deterministic local tsc',
  };
}

function subagentFailed(report: SubagentReport): boolean {
  return report.status !== 'finished' && report.status !== 'skipped';
}

export async function runAudit(config?: OrchestratorConfig): Promise<AuditReport> {
  const cfg = config ?? parseOrchestratorConfig();
  const root = repoRoot();

  const flowBefore = await fetchFlowHealth();
  const remediation = await runAutoRemediation(flowBefore.payload);
  const flowAfter = await fetchFlowHealth();
  const deterministic = await runDeterministicCore(root);

  const { signature: flowSignature, reasons: flowReasons } = gateFromFlowHealth(flowAfter.payload);
  const reasons = [...flowReasons];
  let gate_signature: 'EDOG: PASS' | 'EDOG: FAIL' = flowSignature;

  if (flowAfter.error) {
    gate_signature = 'EDOG: FAIL';
    reasons.push(`flow_health_fetch:${flowAfter.error}`);
  }
  if (!deterministic.tsc_ok) {
    gate_signature = 'EDOG: FAIL';
    reasons.push(`tsc_exit_${deterministic.tsc_exit_code}`);
  }
  const mcpConnect = deterministic.mcp._connect;
  if (mcpConnect && !mcpConnect.ok) {
    gate_signature = 'EDOG: FAIL';
    reasons.push(`mcp_connect:${mcpConnect.error}`);
  }

  const typeValidator = typeValidatorFromTsc(deterministic);
  let dataFlowAuditor: SubagentReport = { status: 'skipped' };
  let model_id: string | undefined;
  let openrouter_model: string | undefined;
  let llm_comment_preview: string | undefined;

  if (cfg.llmProvider === 'cursor') {
    const apiKey = requireCursorApiKey();
    model_id = await resolveModelId(apiKey);
    dataFlowAuditor = await runCursorDataFlowAuditor(root, apiKey, model_id, cfg.cursorTarget);
    if (subagentFailed(dataFlowAuditor)) {
      gate_signature = 'EDOG: FAIL';
      reasons.push(`dataFlowAuditor:${dataFlowAuditor.status}`);
    }
  } else if (cfg.llmProvider === 'openrouter') {
    openrouter_model = resolveOpenRouterModel();
    const or = await runOpenRouterComment(root, {
      flowHealth: flowAfter.payload,
      remediation,
      deterministic,
    });
    if (or.error) {
      dataFlowAuditor = { status: 'run_failed', error: or.error };
      gate_signature = 'EDOG: FAIL';
      reasons.push(`openrouter:${or.error}`);
    } else {
      dataFlowAuditor = { status: 'finished', resultPreview: or.preview };
      llm_comment_preview = or.preview;
    }
  }

  const report: AuditReport = {
    checked_at: new Date().toISOString(),
    repo_root: root,
    llm_provider: cfg.llmProvider,
    ...(cfg.llmProvider === 'cursor' ? { cursor_target: cfg.cursorTarget, model_id } : {}),
    ...(cfg.llmProvider === 'openrouter' ? { openrouter_model } : {}),
    remediation,
    deterministic,
    flow_health_before: flowBefore.payload,
    flow_health: flowAfter.payload,
    ...(flowAfter.error ? { flow_health_fetch_error: flowAfter.error } : {}),
    subagents: { dataFlowAuditor, typeValidator },
    ...(llm_comment_preview ? { llm_comment_preview } : {}),
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
    console.log(
      JSON.stringify(
        {
          llm_provider: report.llm_provider,
          cursor_target: report.cursor_target,
          remediation: report.remediation.stopped_reason,
          reasons: report.reasons,
        },
        null,
        2,
      ),
    );
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
