#!/usr/bin/env node
/**
 * Post-deploy smoke gate (fail-closed). Run sequentially; any step failure aborts with exit code 1.
 *
 * Required env:
 *   SMOKE_BASE_URL          — HTTPS origin for the chat worker (e.g. https://asystent.example.com), no trailing slash.
 *                             Used for App Proxy path, S2S /chat, and /pixel + /pixel/events (via chat worker proxy).
 *   SMOKE_RAG_HEALTH_URL    — Full URL to RAG worker GET /health (e.g. https://<rag-host>/health). RAG has no route in repo;
 *                             public URL comes from Cloudflare dashboard / workers.dev — set explicitly per environment.
 *
 * Optional env:
 *   SMOKE_ANALYTICS_ADMIN_KEY — Must match workers/analytics secret ADMIN_KEY. Required unless SKIP_D1_VERIFY=1.
 *   SKIP_D1_VERIFY           — Set to "1" to only assert POST /pixel returns 200 (dev / no admin key). Default in CI: verify D1 via GET /pixel/events.
 *   SMOKE_HTTP_TIMEOUT_MS    — Per-request timeout (default 15000).
 *
 * GitHub Actions: map repository secrets to these names in the deploy workflow env (see docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md).
 */

import process from 'node:process';

const timeoutMs = Number(process.env.SMOKE_HTTP_TIMEOUT_MS ?? '15000');
const skipD1 = String(process.env.SKIP_D1_VERIFY ?? '').trim() === '1';

function mustEnv(name) {
  const v = process.env[name];
  if (typeof v !== 'string' || v.trim().length === 0) {
    console.error(`[smoke] fail-closed: missing required env ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function normalizeBase(url) {
  return url.replace(/\/+$/, '');
}

function smokeFetch(url, init = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...init, signal });
}

function assertStatus(res, expected, label) {
  if (res.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${res.status}`);
  }
}

/** RAG /health must not leak secret material; bindings are booleans + non-sensitive config strings. */
function assertRagHealthNoSecretLeak(bodyText, label) {
  const forbidden = [/ADMIN_TOKEN/i, /Bearer\s+[A-Za-z0-9._-]{20,}/];
  for (const re of forbidden) {
    if (re.test(bodyText)) {
      throw new Error(`${label}: response body may expose sensitive material (pattern ${re})`);
    }
  }
}

async function checkIngress(base) {
  console.log('[smoke] 1/3 ingress: POST /apps/assistant/chat without HMAC → 401');
  const appProxyUrl = `${base}/apps/assistant/chat`;
  const appRes = await smokeFetch(appProxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ message: 'smoke', stream: false }),
  });
  assertStatus(appRes, 401, 'app proxy /apps/assistant/chat');

  console.log('[smoke] 1/3 ingress: POST /chat with invalid X-EPIR-SHARED-SECRET → 401');
  const chatUrl = `${base}/chat`;
  const s2sRes = await smokeFetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-EPIR-SHARED-SECRET': '__smoke_wrong_secret__',
      'X-EPIR-STOREFRONT-ID': 'zareczyny',
      'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
    },
    body: JSON.stringify({ message: 'smoke', stream: false }),
  });
  assertStatus(s2sRes, 401, 'S2S /chat invalid secret');
}

async function checkRagHealth(ragHealthUrl) {
  console.log('[smoke] 2/3 RAG: GET /health');
  const res = await smokeFetch(ragHealthUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  assertStatus(res, 200, 'RAG /health status');
  const text = await res.text();
  assertRagHealthNoSecretLeak(text, 'RAG /health body');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('RAG /health: body is not JSON');
  }
  if (json.status !== 'ok' || json.service !== 'epir-rag-worker') {
    throw new Error(`RAG /health: unexpected payload (status/service): ${text.slice(0, 240)}`);
  }
  const b = json.bindings;
  if (!b || typeof b !== 'object') {
    throw new Error('RAG /health: missing bindings object');
  }
  if (!b.vectorIndex || !b.ai) {
    throw new Error(`RAG /health: expected vectorIndex and ai bindings true, got ${JSON.stringify(b)}`);
  }
}

async function checkAnalyticsPipeline(base, adminKey, correlationId) {
  console.log('[smoke] 3/3 analytics: POST /pixel synthetic event');
  const pixelUrl = `${base}/pixel`;
  const payload = {
    type: 'epir_ci_smoke',
    data: {
      smoke_correlation_id: correlationId,
      sessionId: correlationId,
      storefront_id: 'ci-smoke',
      channel: 'ci-smoke',
      page_url: 'https://ci.internal/epir-post-deploy-smoke',
    },
  };
  const postRes = await smokeFetch(pixelUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assertStatus(postRes, 200, 'POST /pixel');
  const postJson = await postRes.json().catch(() => null);
  if (!postJson || postJson.ok !== true) {
    throw new Error(`POST /pixel: expected { ok: true }, got ${JSON.stringify(postJson)}`);
  }

  if (skipD1) {
    console.log('[smoke] 3/3 analytics: SKIP_D1_VERIFY=1 — skipping GET /pixel/events');
    return;
  }

  if (!adminKey) {
    console.error('[smoke] fail-closed: SMOKE_ANALYTICS_ADMIN_KEY required when SKIP_D1_VERIFY is not set');
    process.exit(1);
  }

  const eventsUrl = `${base}/pixel/events?limit=80`;
  const maxAttempts = 8;
  const delayMs = 750;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[smoke] 3/3 analytics: GET /pixel/events (attempt ${attempt}/${maxAttempts})`);
    const evRes = await smokeFetch(eventsUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${adminKey}`,
      },
    });
    assertStatus(evRes, 200, 'GET /pixel/events');
    const evJson = await evRes.json().catch(() => null);
    const events = evJson && Array.isArray(evJson.events) ? evJson.events : [];
    const found = events.some(
      (e) =>
        e &&
        typeof e === 'object' &&
        e.event === 'epir_ci_smoke' &&
        e.data &&
        typeof e.data === 'object' &&
        e.data.smoke_correlation_id === correlationId,
    );
    if (found) {
      console.log('[smoke] 3/3 analytics: verified row visible via /pixel/events');
      return;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error(
    `D1 read-back failed: no epir_ci_smoke event with smoke_correlation_id=${correlationId} in recent /pixel/events`,
  );
}

async function main() {
  const base = normalizeBase(mustEnv('SMOKE_BASE_URL'));
  const ragHealthUrl = mustEnv('SMOKE_RAG_HEALTH_URL');

  const adminKey = skipD1
    ? (process.env.SMOKE_ANALYTICS_ADMIN_KEY || '').trim()
    : mustEnv('SMOKE_ANALYTICS_ADMIN_KEY');

  await checkIngress(base);
  await checkRagHealth(ragHealthUrl);

  const correlationId = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  await checkAnalyticsPipeline(base, adminKey || null, correlationId);

  console.log('[smoke] all checks passed');
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
