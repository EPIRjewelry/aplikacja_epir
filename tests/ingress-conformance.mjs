import assert from 'node:assert/strict';

const cfg = {
  ingressUrl: process.env.EPIR_INGRESS_URL,
  sharedSecret: process.env.EPIR_SHARED_SECRET,
  storefrontId: process.env.EPIR_STOREFRONT_ID ?? 'zareczyny',
  channel: process.env.EPIR_CHANNEL ?? 'hydrogen-zareczyny',
  brand: process.env.EPIR_BRAND ?? 'zareczyny',
  timeoutMs: Number(process.env.EPIR_TIMEOUT_MS ?? '10000'),
};

const scenarios = [
  {
    name: 'Brak autoryzacji',
    expectedStatus: 401,
    headers: {},
  },
  {
    name: 'Nieważny klucz',
    expectedStatus: 401,
    headers: {
      secret: 'definitely-wrong-secret',
      storefrontIdHeader: cfg.storefrontId,
      channelHeader: cfg.channel,
    },
  },
  {
    name: 'Brak X-EPIR-STOREFRONT-ID',
    expectedStatus: 400,
    headers: {
      secret: cfg.sharedSecret,
      channelHeader: cfg.channel,
    },
  },
  {
    name: 'Brak X-EPIR-CHANNEL',
    expectedStatus: 400,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: cfg.storefrontId,
    },
  },
  {
    name: 'Prawidłowy kontrakt S2S',
    expectedStatus: 200,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: cfg.storefrontId,
      channelHeader: cfg.channel,
    },
  },
];

function assertConfig() {
  assert.ok(
    cfg.ingressUrl,
    'Brak EPIR_INGRESS_URL. Ustaw URL ingressu, np. https://asystent.epirbizuteria.pl/chat',
  );
  assert.ok(
    cfg.sharedSecret,
    'Brak EPIR_SHARED_SECRET. Ustaw poprawny współdzielony sekret dla kontraktu S2S.',
  );
  assert.ok(
    Number.isFinite(cfg.timeoutMs) && cfg.timeoutMs >= 1000,
    'EPIR_TIMEOUT_MS musi być liczbą >= 1000',
  );
}

function buildPayload() {
  return {
    message: 'hej',
    stream: false,
    brand: cfg.brand,
    storefrontId: 'body-storefront',
    channel: 'body-channel',
  };
}

function buildHeaders({ secret, storefrontIdHeader, channelHeader } = {}) {
  const headers = new Headers({
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  });

  if (secret !== undefined) {
    headers.set('X-EPIR-SHARED-SECRET', secret);
  }
  if (storefrontIdHeader !== undefined) {
    headers.set('X-EPIR-STOREFRONT-ID', storefrontIdHeader);
  }
  if (channelHeader !== undefined) {
    headers.set('X-EPIR-CHANNEL', channelHeader);
  }

  return headers;
}

function previewBody(bodyText) {
  const normalized = bodyText.replace(/\s+/g, ' ').trim();
  if (!normalized) return '<empty>';
  return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized;
}

async function sendIngressRequest({ secret, storefrontIdHeader, channelHeader } = {}) {
  const response = await fetch(cfg.ingressUrl, {
    method: 'POST',
    headers: buildHeaders({ secret, storefrontIdHeader, channelHeader }),
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

async function main() {
  assertConfig();

  let failures = 0;

  console.log('EPIR ingress conformance test');
  console.log(`Target: ${cfg.ingressUrl}`);

  for (const scenario of scenarios) {
    try {
      const result = await sendIngressRequest(scenario.headers);
      if (result.status !== scenario.expectedStatus) {
        failures += 1;
        console.error(
          `❌ ${scenario.name} -> expected ${scenario.expectedStatus}, got ${result.status} | content-type=${result.contentType || '<none>'} | body=${result.preview}`,
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

  console.log('✅ Wszystkie scenariusze ingress P0 przeszły pomyślnie.');
}

await main();