import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const cfg = {
  shopDomain:
    process.env.SHOPIFY_SHOP_DOMAIN ?? 'epir-art-silver-jewellery.myshopify.com',
  appProxyUrl:
    process.env.EPIR_APP_PROXY_URL
    ?? `https://${process.env.SHOPIFY_SHOP_DOMAIN ?? 'epir-art-silver-jewellery.myshopify.com'}/apps/assistant/chat`,
  // Powinien odpowiadać sekretowi SHOPIFY_APP_SECRET ustawionemu po stronie chat workera.
  sharedSecret: process.env.SHOPIFY_APP_PROXY_SHARED_SECRET,
  brand: process.env.EPIR_BRAND ?? 'zareczyny',
  timeoutMs: Number(process.env.EPIR_TIMEOUT_MS ?? '10000'),
};
const nowEpochSeconds = Math.floor(Date.now() / 1000);

function canonicalizeParams(params) {
  const excluded = new Set(['signature', 'hmac', 'shopify_hmac']);
  const entries = [...params.entries()]
    .filter(([key]) => !excluded.has(key))
    .sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([key, value]) => `${key}=${value}`).join('');
}

function signHex(secret, message) {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

function buildPayload(overrides = {}) {
  return {
    message: 'hej',
    stream: false,
    brand: cfg.brand,
    ...overrides,
  };
}

function buildScenarioUrl({
  timestampOffsetSeconds = 0,
  nonceSeed = 'default',
  pathname,
} = {}) {
  const url = new URL(cfg.appProxyUrl);
  if (pathname) {
    url.pathname = pathname;
  }
  const timestamp = String(nowEpochSeconds + timestampOffsetSeconds);
  const nonce = `conformance-${nonceSeed}`;

  url.searchParams.set('shop', cfg.shopDomain);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('nonce', nonce);

  return url;
}

function previewBody(bodyText) {
  const normalized = bodyText.replace(/\s+/g, ' ').trim();
  if (!normalized) return '<empty>';
  return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized;
}

async function sendRequest({
  includeSignature = true,
  signatureSecret,
  urlOptions = {},
  payloadOverrides = {},
}) {
  const url = buildScenarioUrl(urlOptions);
  if (includeSignature) {
    const canonical = canonicalizeParams(url.searchParams);
    const signature = signHex(signatureSecret, canonical);
    url.searchParams.set('signature', signature);
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildPayload(payloadOverrides)),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  const bodyText = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    rawBody: bodyText,
    preview: previewBody(bodyText),
  };
}

function assertConfig() {
  assert.ok(
    cfg.sharedSecret,
    'Brak SHOPIFY_APP_PROXY_SHARED_SECRET. Ustaw sekret zgodny z SHOPIFY_APP_SECRET workera.',
  );
  assert.ok(
    Number.isFinite(cfg.timeoutMs) && cfg.timeoutMs >= 1000,
    'EPIR_TIMEOUT_MS musi być liczbą >= 1000',
  );
}

function assertJsonContentType(result, label) {
  const ct = (result.contentType || '').toLowerCase();
  if (!ct.includes('application/json')) {
    throw new Error(
      `${label}: oczekiwano content-type zawierającego "application/json", otrzymano "${result.contentType || '<none>'}"`,
    );
  }
  try {
    const parsed = JSON.parse(result.rawBody);
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(`${label}: body nie jest obiektem JSON (typ=${typeof parsed})`);
    }
  } catch (error) {
    throw new Error(`${label}: body nie jest poprawnym JSON-em — ${error instanceof Error ? error.message : String(error)} | preview=${result.preview}`);
  }
}

function assertSseContentType(result, label) {
  const ct = (result.contentType || '').toLowerCase();
  if (!ct.includes('text/event-stream')) {
    throw new Error(
      `${label}: oczekiwano content-type zawierającego "text/event-stream", otrzymano "${result.contentType || '<none>'}"`,
    );
  }
}

function assertErrorBody(result, label) {
  if (result.rawBody.length === 0) return;
  const ct = (result.contentType || '').toLowerCase();
  if (!ct.includes('application/json')) return;
  let parsed;
  try {
    parsed = JSON.parse(result.rawBody);
  } catch {
    return;
  }
  if (parsed && typeof parsed === 'object') {
    if ('reply' in parsed) {
      throw new Error(`${label}: 4xx body nie powinno zawierać pola "reply".`);
    }
    if (parsed.ok === true) {
      throw new Error(`${label}: 4xx body nie powinno mieć "ok":true.`);
    }
  }
}

const scenarios = [
  {
    name: 'Brak sygnatury HMAC',
    expected: [401],
    params: {
      includeSignature: false,
      signatureSecret: 'unused-secret',
      urlOptions: { nonceSeed: 'missing-signature' },
    },
    assertResult: assertErrorBody,
  },
  {
    name: 'Niezgodność kryptograficzna (zły sekret)',
    expected: [401, 403],
    params: {
      signatureSecret: 'wrong-secret',
      urlOptions: { nonceSeed: 'wrong-secret' },
    },
    assertResult: assertErrorBody,
  },
  {
    name: 'Sygnatura ze stale timestamp (poniżej okna -300s)',
    expected: [401],
    params: {
      signatureSecret: cfg.sharedSecret,
      urlOptions: {
        nonceSeed: 'stale-timestamp',
        timestampOffsetSeconds: -3600,
      },
    },
    assertResult: assertErrorBody,
  },
  {
    name: 'Sygnatura z przyszłym timestampem (powyżej okna +300s)',
    expected: [401],
    params: {
      signatureSecret: cfg.sharedSecret,
      urlOptions: {
        nonceSeed: 'future-timestamp',
        timestampOffsetSeconds: 3600,
      },
    },
    assertResult: assertErrorBody,
  },
  {
    name: 'Poprawna autoryzacja Shopify App Proxy signature',
    expected: [200],
    params: {
      signatureSecret: cfg.sharedSecret,
      urlOptions: { nonceSeed: 'valid-chat' },
    },
    assertResult: assertJsonContentType,
  },
  {
    name: 'Streaming SSE: stream:true w kanale App Proxy',
    expected: [200],
    params: {
      signatureSecret: cfg.sharedSecret,
      urlOptions: { nonceSeed: 'valid-chat-sse' },
      payloadOverrides: {
        stream: true,
        message: 'krótki test SSE',
      },
    },
    assertResult: assertSseContentType,
  },
  {
    name: 'Policy tools dostępne, internal-only ukryte w App Proxy',
    expected: [200],
    params: {
      signatureSecret: cfg.sharedSecret,
      urlOptions: {
        nonceSeed: 'tools-list',
        pathname: '/apps/assistant/mcp',
      },
      payloadOverrides: {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'conformance-tools-list',
      },
    },
    assertResult(result, label) {
      assertJsonContentType(result, label);
      const parsed = JSON.parse(result.rawBody);
      if (parsed?.jsonrpc !== '2.0') {
        throw new Error(`${label}: brak/niepoprawne pole "jsonrpc" w odpowiedzi MCP (oczekiwano "2.0").`);
      }
      if (parsed?.id !== 'conformance-tools-list') {
        throw new Error(`${label}: pole "id" w odpowiedzi MCP musi odpowiadać żądaniu ("conformance-tools-list").`);
      }
      const tools = Array.isArray(parsed?.result?.tools) ? parsed.result.tools : null;
      if (!Array.isArray(tools)) {
        throw new Error(`${label}: oczekiwano tablicy result.tools w odpowiedzi MCP.`);
      }
      const toolNames = tools
        .map((tool) => tool?.name ?? tool?.function?.name)
        .filter((name) => typeof name === 'string');
      if (!toolNames.includes('get_shop_policies')) {
        throw new Error(
          `${label}: brak get_shop_policies w tools/list, otrzymano: ${toolNames.join(', ') || '<none>'}`,
        );
      }
      if (toolNames.includes('run_analytics_query')) {
        throw new Error(`${label}: run_analytics_query musi być internal-only i niedostępne w App Proxy.`);
      }
      if (toolNames.includes('fetch_marketing_preview')) {
        throw new Error(`${label}: fetch_marketing_preview musi być internal-only i niedostępne w App Proxy.`);
      }
      if (toolNames.includes('run_shopify_shopifyql')) {
        throw new Error(`${label}: run_shopify_shopifyql musi być internal-only i niedostępne w App Proxy.`);
      }
    },
  },
];

async function main() {
  assertConfig();

  let failures = 0;

  console.log('EPIR App Proxy conformance test');
  console.log(`Target: ${cfg.appProxyUrl}`);
  console.log(`Shop: ${cfg.shopDomain}`);

  for (const scenario of scenarios) {
    try {
      const result = await sendRequest(scenario.params);
      if (!scenario.expected.includes(result.status)) {
        failures += 1;
        console.error(
          `❌ ${scenario.name} -> expected ${scenario.expected.join('/')} got ${result.status} | content-type=${result.contentType || '<none>'} | body=${result.preview}`,
        );
        continue;
      }
      if (typeof scenario.assertResult === 'function') {
        scenario.assertResult(result, scenario.name);
      }
      console.log(`✅ ${scenario.name} -> ${result.status}`);
    } catch (error) {
      failures += 1;
      console.error(`❌ ${scenario.name} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('✅ App Proxy ingress conformance zaliczony (P0+P1).');
}

await main();
