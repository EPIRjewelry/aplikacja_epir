#!/usr/bin/env node
/**
 * Post-deploy smoke gate (fail-closed). Run sequentially; any step failure aborts with exit code 1.
 *
 * Required env:
 *   SMOKE_BASE_URL          — HTTPS origin for the chat worker (e.g. https://asystent.example.com), no trailing slash.
 *                             Used for App Proxy path, S2S /chat, and /pixel* (via chat worker proxy).
 *   SMOKE_RAG_HEALTH_URL    — Full URL to RAG worker GET /health (e.g. https://<rag-host>/health). RAG has no route in repo;
 *                             public URL comes from Cloudflare dashboard / workers.dev — set explicitly per environment.
 *
 * Optional env:
 *   SMOKE_EPIR_CHAT_SHARED_SECRET — Must match workers/chat secret EPIR_CHAT_SHARED_SECRET (X-EPIR-SHARED-SECRET + storefront/channel dla GET read-back). Required unless SKIP_D1_VERIFY=1.
 *   SKIP_D1_VERIFY           — Set to "1" to only assert POST /pixel/events returns 200 (dev / smoke S2S absent).
 *                              Default in CI: verify D1 via GET /pixel/events with x-d1-bookmark z POST oraz nagłówkami S2S jak /chat.
 *   SMOKE_HTTP_TIMEOUT_MS    — Per-request timeout (default 15000).
 *   SMOKE_HTTP_MAX_ATTEMPTS  — Max tries per logical request incl. backoff for 429 / transient gateways (default 5).
 *
 * GitHub Actions: map repository secrets to these names in the deploy workflow env (see docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md).
 */

import process from 'node:process';

const timeoutMs = Number(process.env.SMOKE_HTTP_TIMEOUT_MS ?? '15000');
const skipD1 = String(process.env.SKIP_D1_VERIFY ?? '').trim() === '1';
const smokeMaxAttempts = Math.max(
  1,
  Number.parseInt(String(process.env.SMOKE_HTTP_MAX_ATTEMPTS ?? '5'), 10) || 5,
);

const BACKOFF_SEQUENCE_MS = [1000, 2000, 4000, 8000];

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(headerVal) {
  if (typeof headerVal !== 'string' || headerVal.trim() === '') return 0;
  const t = headerVal.trim();
  const asNum = Number(t);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.ceil(asNum * 1000);
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) {
    const delta = parsed - Date.now();
    return delta > 0 ? delta : 0;
  }
  return 0;
}

function cfRayFrom(res) {
  return typeof res.headers.get === 'function' ? res.headers.get('cf-ray') : null;
}

function redactSmokeBodyText(text, maxChars = 8000) {
  let out = typeof text === 'string' ? text : String(text);
  out = out.slice(0, maxChars);
  out = out.replace(/Bearer\s+[\w._~+/=-]{8,}\.[\w._~+/=-]+\.[\w._~+/=-]+/gi, 'Bearer [REDACTED_JWT]');
  out = out.replace(/Bearer\s+[\w.-]{24,}/gi, 'Bearer [REDACTED_TOKEN]');
  out = out.replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"[REDACTED]"');
  out = out.replace(/\b(EPIR_OPERATOR_PANEL_SECRET|EPIR_CHAT_SHARED_SECRET)[=:]\s*[\w.-]+\b/gi, '[REDACTED]');
  return out;
}

function pipelineAbort({ label, res, note, bodySnippet }) {
  const ray = res ? cfRayFrom(res) : null;
  const status = res?.status ?? null;
  console.error(JSON.stringify(
    {
      smoke_pipeline_abort: true,
      label,
      note,
      cf_ray: ray,
      http_status: status,
      response_body_redacted: bodySnippet ?? null,
    },
    null,
    2,
  ));
  process.exit(1);
}

function shouldBackoffHttpStatus(code) {
  return code === 429 || code === 502 || code === 503 || code === 504;
}

async function smokeFetchOnce(url, init = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...init, signal });
}

/**
 * Executes fetch with exponential backoff on 429 / transient gateways; honors Retry-After when present.
 * Does not swallow terminal HTTP errors — callers assert expected status afterward.
 */
async function smokeFetchResilient(url, init = {}) {
  const { label: attemptLabel, ...fetchInit } = init;
  const logicalLabel = typeof attemptLabel === 'string' ? attemptLabel : url;

  let lastRes = /** @type {Response | null} */ (null);
  let lastErr = /** @type {Error | null} */ (null);
  let backoffStage = -1;

  for (let attempt = 1; attempt <= smokeMaxAttempts; attempt += 1) {
    try {
      lastRes = await smokeFetchOnce(url, fetchInit);

      const ra = parseRetryAfterMs(lastRes.headers.get('retry-after'));

      if (shouldBackoffHttpStatus(lastRes.status)) {
        if (attempt >= smokeMaxAttempts) {
          const text = redactSmokeBodyText(await lastRes.clone().text().catch(() => ''));
          pipelineAbort({
            label: logicalLabel,
            res: lastRes,
            note: `HTTP ${lastRes.status}: exhausted retries (${attempt}/${smokeMaxAttempts})`,
            bodySnippet: text,
          });
        }
        backoffStage += 1;
        const backoff = BACKOFF_SEQUENCE_MS[Math.min(backoffStage, BACKOFF_SEQUENCE_MS.length - 1)];
        await sleep(Math.max(ra, backoff));
        continue;
      }

      return lastRes;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt >= smokeMaxAttempts) {
        console.error(JSON.stringify(
          {
            smoke_pipeline_abort: true,
            label: logicalLabel,
            note: 'network_failure_after_retries',
            http_status: null,
            cf_ray: lastRes ? cfRayFrom(lastRes) : null,
            error: redactSmokeBodyText(lastErr.message ?? String(lastErr)),
          },
          null,
          2,
        ));
        process.exit(1);
      }
      backoffStage += 1;
      const backoff = BACKOFF_SEQUENCE_MS[Math.min(backoffStage, BACKOFF_SEQUENCE_MS.length - 1)];
      await sleep(backoff);
    }
  }

  pipelineAbort({
    label: logicalLabel,
    res: lastRes ?? undefined,
    note: lastErr?.message ?? 'unexpected smoke fetch exhaustion',
    bodySnippet: null,
  });
}

async function assertStatuses(res, expectedSet, label) {
  const expectedArr = [...expectedSet];
  if (!expectedSet.has(res.status)) {
    const txt = await res.text();
    pipelineAbort({
      label,
      res,
      note: `expected HTTP ${expectedArr.join('|')}`,
      bodySnippet: redactSmokeBodyText(txt),
    });
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
  const appRes = await smokeFetchResilient(appProxyUrl, {
    label: 'app proxy POST /apps/assistant/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ message: 'smoke', stream: false }),
  });
  await assertStatuses(appRes, new Set([401]), 'app proxy /apps/assistant/chat');

  console.log('[smoke] 1/3 ingress: POST /chat with invalid X-EPIR-SHARED-SECRET → 401');
  const chatUrl = `${base}/chat`;
  const s2sRes = await smokeFetchResilient(chatUrl, {
    label: 'S2S POST /chat invalid secret',
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
  await assertStatuses(s2sRes, new Set([401]), 'S2S /chat invalid secret');
}

async function checkRagHealth(ragHealthUrl) {
  console.log('[smoke] 2/3 RAG: GET /health');
  const res = await smokeFetchResilient(ragHealthUrl, {
    label: `RAG GET ${ragHealthUrl}`,
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  await assertStatuses(res, new Set([200]), 'RAG /health status');
  const text = await res.text();
  assertRagHealthNoSecretLeak(text, 'RAG /health body');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    pipelineAbort({
      label: 'RAG /health JSON',
      res,
      note: 'body is not JSON',
      bodySnippet: redactSmokeBodyText(text),
    });
  }
  if (json.status !== 'ok' || json.service !== 'epir-rag-worker') {
    pipelineAbort({
      label: 'RAG /health payload',
      res,
      note: 'unexpected status/service fields',
      bodySnippet: redactSmokeBodyText(text),
    });
  }
  const b = json.bindings;
  if (!b || typeof b !== 'object') {
    pipelineAbort({
      label: 'RAG /health bindings',
      res,
      note: 'missing bindings object',
      bodySnippet: redactSmokeBodyText(text),
    });
  }
  if (!b.vectorIndex || !b.ai) {
    pipelineAbort({
      label: 'RAG /health bindings',
      res,
      note: `expected vectorIndex and ai bindings true, got ${JSON.stringify(b)}`,
      bodySnippet: redactSmokeBodyText(text),
    });
  }
}

async function checkAnalyticsPipeline(base, smokeChatSharedSecret, correlationId) {
  console.log('[smoke] 3/3 analytics: POST /pixel/events synthetic event (D1 bookmark from response)');
  const pixelUrl = `${base}/pixel/events`;
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
  const postRes = await smokeFetchResilient(pixelUrl, {
    label: 'POST /pixel/events',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertStatuses(postRes, new Set([200]), 'POST /pixel/events');

  let postParsed = /** @type {Record<string, unknown> | null} */ (null);
  try {
    postParsed = await postRes.json();
  } catch {
    const t = await postRes.clone().text().catch(() => '');
    pipelineAbort({
      label: 'POST /pixel/events JSON',
      res: postRes,
      note: 'response body is not JSON',
      bodySnippet: redactSmokeBodyText(t),
    });
  }
  const hdrBmRaw = typeof postRes.headers.get === 'function' ? postRes.headers.get('x-d1-bookmark') : null;
  const postBookmark = (typeof hdrBmRaw === 'string' && hdrBmRaw.trim())
    ? hdrBmRaw.trim()
    : (typeof postParsed?.d1_bookmark === 'string' ? postParsed.d1_bookmark.trim() : '');
  const postOkObj = typeof postParsed === 'object' && postParsed !== null ? postParsed : null;
  if (!postOkObj || postOkObj.ok !== true) {
    pipelineAbort({
      label: 'POST /pixel/events contract',
      res: postRes,
      note: 'expected { ok: true }',
      bodySnippet: redactSmokeBodyText(JSON.stringify(postParsed)),
    });
  }

  if (!postBookmark) {
    console.warn('[smoke] 3/3 analytics: WARN — empty D1 bookmark (sessions API inactive or emulator); sequential read-back not enforced');
  }

  if (skipD1) {
    console.log('[smoke] 3/3 analytics: SKIP_D1_VERIFY=1 — skipping GET /pixel/events');
    return;
  }

  if (!smokeChatSharedSecret) {
    console.error('[smoke] fail-closed: SMOKE_EPIR_CHAT_SHARED_SECRET required when SKIP_D1_VERIFY is not set');
    process.exit(1);
  }

  const eventsUrl = `${base}/pixel/events?limit=80`;
  const maxReadAttempts = 8;
  /** Exponential backoff between read polls (distinct from transient HTTP backoff). */
  let readPollBackoffIdx = -1;

  for (let attempt = 1; attempt <= maxReadAttempts; attempt += 1) {
    console.log(`[smoke] 3/3 analytics: GET /pixel/events (attempt ${attempt}/${maxReadAttempts}, x-d1-bookmark propagated, S2S)`);

    const evHeaders = {
      Accept: 'application/json',
      'X-EPIR-SHARED-SECRET': smokeChatSharedSecret,
      'X-EPIR-STOREFRONT-ID': 'ci-smoke',
      'X-EPIR-CHANNEL': 'ci-smoke-readback',
    };
    if (postBookmark) {
      evHeaders['x-d1-bookmark'] = postBookmark;
    }

    const evRes = await smokeFetchResilient(eventsUrl, {
      label: `GET /pixel/events attempt ${attempt}`,
      method: 'GET',
      headers: evHeaders,
    });
    await assertStatuses(evRes, new Set([200]), 'GET /pixel/events');

    let evJson = /** @type {{ events?: unknown } | null} */ (null);
    try {
      evJson = await evRes.json();
    } catch {
      const t = await evRes.clone().text().catch(() => '');
      pipelineAbort({
        label: 'GET /pixel/events JSON',
        res: evRes,
        note: 'invalid JSON body',
        bodySnippet: redactSmokeBodyText(t),
      });
    }
    const events = evJson && Array.isArray(evJson.events) ? evJson.events : [];
    const found = events.some(
      (e) =>
        e &&
        typeof e === 'object'
        && e.event === 'epir_ci_smoke'
        && e.data
        && typeof e.data === 'object'
        && e.data.smoke_correlation_id === correlationId,
    );
    if (found) {
      console.log('[smoke] 3/3 analytics: verified row visible via /pixel/events (bookmark-consistent read)');
      return;
    }
    if (attempt < maxReadAttempts) {
      readPollBackoffIdx += 1;
      const backoff = BACKOFF_SEQUENCE_MS[
        Math.min(readPollBackoffIdx, BACKOFF_SEQUENCE_MS.length - 1)
      ];
      await sleep(backoff);
    }
  }

  console.error(JSON.stringify(
    {
      smoke_pipeline_abort: true,
      label: 'analytics D1 read-back',
      note: `no epir_ci_smoke with smoke_correlation_id=${correlationId} within ${maxReadAttempts} backoff polls`,
      cf_ray: null,
      http_status: null,
      response_body_redacted: null,
    },
    null,
    2,
  ));
  process.exit(1);
}

async function main() {
  const base = normalizeBase(mustEnv('SMOKE_BASE_URL'));
  const ragHealthUrl = mustEnv('SMOKE_RAG_HEALTH_URL');

  const smokeS2s = skipD1
    ? (process.env.SMOKE_EPIR_CHAT_SHARED_SECRET || '').trim()
    : mustEnv('SMOKE_EPIR_CHAT_SHARED_SECRET');

  await checkIngress(base);
  await checkRagHealth(ragHealthUrl);

  const correlationId = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  await checkAnalyticsPipeline(base, smokeS2s || null, correlationId);

  console.log('[smoke] all checks passed');
}

main().catch((err) => {
  console.error(JSON.stringify(
    {
      smoke_pipeline_abort: true,
      label: 'smoke_uncaught_exception',
      note: redactSmokeBodyText(err instanceof Error ? err.message : String(err)),
      cf_ray: null,
      http_status: null,
      response_body_redacted: null,
    },
    null,
    2,
  ));
  process.exit(1);
});
