/// <reference types="@cloudflare/workers-types" />

// ============================================================================
// BIGQUERY BATCH WORKER – nocny eksport D1 → BigQuery
// ============================================================================
// Cron: codziennie o 2:00 UTC
// Źródła: pixel_events (DB), messages (DB_CHATBOT)
// Logs prefix: [BIGQUERY_BATCH]
// ============================================================================

import { base64UrlEncode, str2ab } from './auth';
import { ANALYTICS_QUERY_WHITELIST, VALID_QUERY_IDS } from './analytics-queries';

interface Env {
  DB: D1Database;
  DB_CHATBOT: D1Database;
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  GOOGLE_PROJECT_ID?: string;
  ADMIN_KEY?: string;
}

const BQ_DATASET = 'analytics_435783047';
/** EPIR pixel/analytics export (D1 pixel_events). Osobna nazwa od legacy `events_raw` (np. ADK / inne skrypty). */
const BQ_TABLE_EVENTS = 'epir_pixel_events_raw';
const BQ_TABLE_MESSAGES = 'messages_raw';
const BATCH_SIZE = 100;

// ============================================================================
// Google Auth (wzór z epir_asystent/workers/analytics-worker)
// ============================================================================

async function getGoogleAuthToken(env: Env, scope = 'https://www.googleapis.com/auth/bigquery.insertdata'): Promise<string | null> {
  if (!env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PROJECT_ID) return null;
  try {
    const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaim = base64UrlEncode(JSON.stringify(claim));
    const signatureInput = `${encodedHeader}.${encodedClaim}`;
    const key = await crypto.subtle.importKey(
      'pkcs8',
      str2ab(pem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signatureInput)
    );
    const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${signatureInput}.${encodedSignature}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    return tokenData.access_token ?? null;
  } catch (e) {
    console.error('[BIGQUERY_BATCH] BigQuery auth error:', e);
    return null;
  }
}

// ============================================================================
// BigQuery streaming insert (bulk)
// ============================================================================

async function bulkInsertToBigQuery(
  env: Env,
  token: string,
  tableId: string,
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; errors: number }> {
  if (rows.length === 0) return { inserted: 0, errors: 0 };
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.GOOGLE_PROJECT_ID}/datasets/${BQ_DATASET}/tables/${tableId}/insertAll`;
  const bqRows = rows.map((r, i) => ({ insertId: `batch_${Date.now()}_${i}`, json: r }));
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bigquery#tableDataInsertAllRequest', rows: bqRows }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('[BIGQUERY_BATCH] BigQuery insert error:', response.status, text);
    return { inserted: 0, errors: rows.length };
  }
  const data = (await response.json()) as { insertErrors?: Array<{ index: number }> };
  const errors = data.insertErrors?.length ?? 0;
  return { inserted: rows.length - errors, errors };
}

// ============================================================================
// Eksport pixel_events
// ============================================================================

async function exportPixelEvents(
  env: Env,
  token: string,
  lastExportAt: number
): Promise<{ exported: number; maxTimestamp: number }> {
  // pixel_events.created_at jest TEXT (ISO) – porównanie przez unix ms
  const stmt = env.DB.prepare(
    `SELECT * FROM pixel_events WHERE (strftime('%s', created_at) * 1000) > ?1 ORDER BY created_at ASC`
  ).bind(lastExportAt);
  const result = await stmt.all<Record<string, unknown>>();
  const rows = result.results ?? [];
  if (rows.length === 0) return { exported: 0, maxTimestamp: lastExportAt };

  let totalInserted = 0;
  let maxTs = lastExportAt;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const bqRows = chunk.map((r) => {
      const createdAt = r.created_at as string;
      const ts = createdAt ? Math.floor(new Date(createdAt).getTime()) : 0;
      if (ts > maxTs) maxTs = ts;
      return {
        event_type: r.event_type,
        session_id: r.session_id,
        customer_id: r.customer_id,
        storefront_id: r.storefront_id ?? null,
        channel: r.channel ?? null,
        url: r.page_url ?? '',
        payload: JSON.stringify(r),
        created_at: createdAt ?? new Date().toISOString(),
      };
    });
    const { inserted } = await bulkInsertToBigQuery(env, token, BQ_TABLE_EVENTS, bqRows);
    totalInserted += inserted;
  }

  // maxTimestamp z ostatniego wiersza
  const lastRow = rows[rows.length - 1];
  const lastCreated = lastRow?.created_at as string | undefined;
  if (lastCreated) {
    const ts = Math.floor(new Date(lastCreated).getTime());
    if (ts > maxTs) maxTs = ts;
  }

  return { exported: totalInserted, maxTimestamp: maxTs };
}

// ============================================================================
// Eksport messages
// ============================================================================

async function exportMessages(
  env: Env,
  token: string,
  lastExportAt: number
): Promise<{ exported: number; maxTimestamp: number }> {
  const stmt = env.DB_CHATBOT.prepare(
    `SELECT * FROM messages WHERE timestamp > ?1 ORDER BY timestamp ASC`
  ).bind(lastExportAt);
  const result = await stmt.all<Record<string, unknown>>();
  const rows = result.results ?? [];
  if (rows.length === 0) return { exported: 0, maxTimestamp: lastExportAt };

  let totalInserted = 0;
  let maxTs = lastExportAt;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const bqRows = chunk.map((r) => {
      const ts = (r.timestamp as number) ?? 0;
      if (ts > maxTs) maxTs = ts;
      return {
        id: r.id,
        session_id: r.session_id,
        role: r.role,
        content: r.content,
        timestamp: r.timestamp,
        tool_calls: r.tool_calls,
        tool_call_id: r.tool_call_id,
        name: r.name,
        storefront_id: r.storefront_id ?? null,
        channel: r.channel ?? null,
      };
    });
    const { inserted } = await bulkInsertToBigQuery(env, token, BQ_TABLE_MESSAGES, bqRows);
    totalInserted += inserted;
  }

  const lastRow = rows[rows.length - 1];
  const lastTs = (lastRow?.timestamp as number) ?? 0;
  if (lastTs > maxTs) maxTs = lastTs;

  return { exported: totalInserted, maxTimestamp: maxTs };
}

// ============================================================================
// Scheduled handler
// ============================================================================

async function handleScheduled(env: Env): Promise<void> {
  console.log('[BIGQUERY_BATCH] Starting scheduled export');

  if (!env.GOOGLE_PROJECT_ID || !env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    console.warn('[BIGQUERY_BATCH] BigQuery secrets not configured, skipping');
    return;
  }

  const token = await getGoogleAuthToken(env);
  if (!token) {
    console.error('[BIGQUERY_BATCH] Failed to obtain Google auth token');
    return;
  }

  // Odczyt stanu batch_exports (tabela w DB)
  let lastPixel = 0;
  let lastMessages = 0;
  try {
    const row = await env.DB.prepare(
      'SELECT last_pixel_export_at, last_messages_export_at FROM batch_exports WHERE id = 1'
    ).first<{ last_pixel_export_at: number; last_messages_export_at: number }>();
    if (row) {
      lastPixel = row.last_pixel_export_at ?? 0;
      lastMessages = row.last_messages_export_at ?? 0;
    }
  } catch (e) {
    console.warn('[BIGQUERY_BATCH] batch_exports table missing or empty, using 0:', e);
  }

  const now = Date.now();

  // Eksport pixel_events
  const pixelResult = await exportPixelEvents(env, token, lastPixel);
  console.log(`[BIGQUERY_BATCH] pixel_events: exported ${pixelResult.exported} rows`);

  // Eksport messages
  const messagesResult = await exportMessages(env, token, lastMessages);
  console.log(`[BIGQUERY_BATCH] messages: exported ${messagesResult.exported} rows`);

  // Aktualizacja batch_exports
  const newPixelTs = pixelResult.exported > 0 ? pixelResult.maxTimestamp : lastPixel;
  const newMessagesTs = messagesResult.exported > 0 ? messagesResult.maxTimestamp : lastMessages;

  try {
    await env.DB.prepare(
      `INSERT INTO batch_exports (id, last_pixel_export_at, last_messages_export_at, updated_at)
       VALUES (1, ?1, ?2, ?3)
       ON CONFLICT(id) DO UPDATE SET
         last_pixel_export_at = excluded.last_pixel_export_at,
         last_messages_export_at = excluded.last_messages_export_at,
         updated_at = excluded.updated_at`
    )
      .bind(newPixelTs, newMessagesTs, now)
      .run();
    console.log('[BIGQUERY_BATCH] batch_exports updated');
  } catch (e) {
    console.error('[BIGQUERY_BATCH] Failed to update batch_exports:', e);
  }

  console.log('[BIGQUERY_BATCH] Export complete');
}

// ============================================================================
// Analytics Query API (run_analytics_query – internal only, ADMIN_KEY)
// ============================================================================

function verifyAdminKey(env: Env, request: Request): boolean {
  const key = env.ADMIN_KEY;
  if (!key) return false;
  const provided = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('X-Admin-Key');
  return provided === key;
}

async function runBigQueryJob(env: Env, query: string): Promise<{ rows?: Record<string, unknown>[]; error?: string }> {
  const token = await getGoogleAuthToken(env, 'https://www.googleapis.com/auth/bigquery.readonly');
  if (!token || !env.GOOGLE_PROJECT_ID) {
    return { error: 'BigQuery not configured for queries' };
  }
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.GOOGLE_PROJECT_ID}/jobs`;
  const jobRes = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configuration: {
        query: { query: query.trim(), useLegacySql: false },
      },
    }),
  });
  if (!jobRes.ok) {
    const errText = await jobRes.text();
    return { error: `BigQuery job failed: ${jobRes.status} ${errText.slice(0, 200)}` };
  }
  const job = (await jobRes.json()) as { jobReference?: { jobId: string; projectId: string; location?: string } };
  const jobId = job.jobReference?.jobId;
  const projectId = job.jobReference?.projectId ?? env.GOOGLE_PROJECT_ID;
  if (!jobId) return { error: 'No job ID in response' };

  // jobs.getQueryResults – czeka na zakończenie (timeoutMs=60000)
  const resultsRes = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?timeoutMs=60000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resultsRes.ok) {
    const errText = await resultsRes.text();
    return { error: `getQueryResults failed: ${resultsRes.status} ${errText.slice(0, 200)}` };
  }
  const data = (await resultsRes.json()) as {
    rows?: Array<{ f?: Array<{ v?: unknown }> }>;
    schema?: { fields?: Array<{ name?: string }> };
    errors?: Array<{ message?: string }>;
  };
  if (data.errors?.length) {
    return { error: data.errors.map((e) => e.message).join('; ') };
  }
  const fields = data.schema?.fields?.map((f) => f.name ?? '') ?? [];
  const rows = (data.rows ?? []).map((r) => {
    const obj: Record<string, unknown> = {};
    fields.forEach((f, i) => {
      obj[f] = r.f?.[i]?.v ?? null;
    });
    return obj;
  });
  return { rows };
}

async function handleAnalyticsQuery(request: Request, env: Env): Promise<Response> {
  if (!verifyAdminKey(env, request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: ADMIN_KEY required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let body: { queryId?: string; dateFrom?: number; dateTo?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const queryId = body?.queryId;
  if (!queryId || typeof queryId !== 'string') {
    return new Response(JSON.stringify({ error: 'queryId required', validIds: VALID_QUERY_IDS }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const sql = ANALYTICS_QUERY_WHITELIST[queryId];
  if (!sql) {
    return new Response(JSON.stringify({ error: `Invalid queryId: ${queryId}`, validIds: VALID_QUERY_IDS }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { rows, error } = await runBigQueryJob(env, sql);
  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ queryId, rows: rows ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ============================================================================
// Worker export
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
      return new Response('ok', { status: 200 });
    }
    if (request.method === 'POST' && url.pathname === '/internal/analytics/query') {
      return handleAnalyticsQuery(request, env);
    }
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
