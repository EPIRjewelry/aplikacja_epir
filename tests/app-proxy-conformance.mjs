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

function buildPayload() {
  return {
    message: 'hej',
    stream: false,
    brand: cfg.brand,
  };
}

function buildScenarioUrl({ timestampOffsetSeconds = 0 } = {}) {
  const url = new URL(cfg.appProxyUrl);
  const timestamp = String(Math.floor(Date.now() / 1000) + timestampOffsetSeconds);
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
}) {
  const url = buildScenarioUrl();
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
    body: JSON.stringify(buildPayload()),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  const bodyText = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
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

const scenarios = [
  {
    name: 'Brak sygnatury HMAC',
    expected: [401],
    params: {
      includeSignature: false,
      signatureSecret: 'unused-secret',
    },
  },
  {
    name: 'Niezgodność kryptograficzna (zły sekret)',
    expected: [401, 403],
    params: {
      signatureSecret: 'wrong-secret',
    },
  },
  {
    name: 'Poprawna autoryzacja Shopify App Proxy signature',
    expected: [200],
    params: {
      signatureSecret: cfg.sharedSecret,
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

  console.log('✅ App Proxy ingress conformance zaliczony.');
}

await main();