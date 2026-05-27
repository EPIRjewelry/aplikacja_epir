import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load `agents/store-steward/.env` (does not override existing process.env). */
export function loadDotEnv(): void {
  const envPath = path.join(__dirname, '..', '.env');
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

/** Same secret name as MCP epir-data-ops and epir-analyst-worker HTTP API. */
export function resolveAnalystOrigin(): string {
  const direct =
    process.env.EPIR_ANALYST_ORIGIN?.trim() ||
    process.env.EPIR_ANALYST_WORKER_ORIGIN?.trim();
  if (direct) return direct.replace(/\/$/, '');

  const batch = process.env.EPIR_BATCH_WORKER_ORIGIN?.trim();
  if (batch) {
    const derived = batch.replace(/epir-bigquery-batch/i, 'epir-analyst-worker');
    if (derived !== batch) return derived.replace(/\/$/, '');
  }

  throw new Error(
    'Missing analyst worker URL: set EPIR_ANALYST_ORIGIN or EPIR_ANALYST_WORKER_ORIGIN ' +
      '(or EPIR_BATCH_WORKER_ORIGIN to auto-derive epir-analyst-worker URL)',
  );
}

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function formatMissingEnvHelp(): string {
  return [
    'Store Steward wymaga:',
    '  CURSOR_API_KEY',
    '  ANALYST_HTTP_BEARER  (wrangler secret na epir-analyst-worker)',
    '  EPIR_ANALYST_ORIGIN lub EPIR_ANALYST_WORKER_ORIGIN',
    '    (opcjonalnie: wyprowadź z EPIR_BATCH_WORKER_ORIGIN — ta sama subdomena workers.dev)',
    '',
    'Przykład:',
    '  Copy-Item agents/store-steward/.env.example agents/store-steward/.env',
    '  # uzupełnij ANALYST_HTTP_BEARER',
    '  npm run steward:report:dry',
  ].join('\n');
}
