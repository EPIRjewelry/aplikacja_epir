import assert from 'node:assert/strict';

const cfg = {
  ingressUrl: process.env.EPIR_INGRESS_URL,
  sharedSecret: process.env.EPIR_SHARED_SECRET,
  storefrontId: process.env.EPIR_STOREFRONT_ID ?? 'zareczyny',
  channel: process.env.EPIR_CHANNEL ?? 'hydrogen-zareczyny',
  brand: process.env.EPIR_BRAND ?? 'zareczyny',
  timeoutMs: Number(process.env.EPIR_TIMEOUT_MS ?? '10000'),
};

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

function assertErrorBodyShape(result, label) {
  // Kontrakt: błędy 4xx mają zwracać krótkie body z opisem (text/plain lub application/json),
  // ale nigdy nie powinny zwracać poprawnej odpowiedzi czatu (`reply` / `ok:true`).
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
      throw new Error(`${label}: 4xx body nie powinno zawierać pola "reply" (leak danych z sukcesu).`);
    }
    if (parsed.ok === true) {
      throw new Error(`${label}: 4xx body nie powinno mieć "ok":true.`);
    }
  }
}

const scenarios = [
  {
    name: 'Brak autoryzacji',
    expectedStatus: 401,
    headers: {},
    assertResult: assertErrorBodyShape,
  },
  {
    name: 'Nieważny klucz',
    expectedStatus: 401,
    headers: {
      secret: 'definitely-wrong-secret',
      storefrontIdHeader: cfg.storefrontId,
      channelHeader: cfg.channel,
    },
    assertResult: assertErrorBodyShape,
  },
  {
    name: 'Brak X-EPIR-STOREFRONT-ID',
    expectedStatus: 400,
    headers: {
      secret: cfg.sharedSecret,
      channelHeader: cfg.channel,
    },
    assertResult: assertErrorBodyShape,
  },
  {
    name: 'Brak X-EPIR-CHANNEL',
    expectedStatus: 400,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: cfg.storefrontId,
    },
    assertResult: assertErrorBodyShape,
  },
  {
    name: 'Prawidłowy kontrakt S2S',
    expectedStatus: 200,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: cfg.storefrontId,
      channelHeader: cfg.channel,
    },
    assertResult: assertJsonContentType,
  },
  {
    name: 'Internal-only: kanał internal-dashboard przez S2S',
    expectedStatus: 200,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: 'online-store',
      channelHeader: 'internal-dashboard',
    },
    payload: {
      brand: 'epir',
    },
    assertResult: assertJsonContentType,
  },
  {
    name: 'Policy flow: pytanie o regulamin w kanale buyer-facing',
    expectedStatus: 200,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: cfg.storefrontId,
      channelHeader: cfg.channel,
    },
    payload: {
      message: 'Jak wygląda polityka zwrotów i reklamacji?',
    },
    assertResult: (result, label) => {
      assertJsonContentType(result, label);
      const parsed = JSON.parse(result.rawBody);
      if (parsed && typeof parsed === 'object' && typeof parsed.reply !== 'string') {
        throw new Error(`${label}: odpowiedź 200 musi zawierać pole "reply" typu string.`);
      }
    },
  },
  {
    name: 'Streaming SSE: stream:true zwraca text/event-stream',
    expectedStatus: 200,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: cfg.storefrontId,
      channelHeader: cfg.channel,
    },
    payload: {
      message: 'krótki test SSE',
      stream: true,
    },
    assertResult: assertSseContentType,
  },
  {
    name: 'Routing: nagłówki X-EPIR-* mają pierwszeństwo nad body',
    expectedStatus: 200,
    headers: {
      secret: cfg.sharedSecret,
      storefrontIdHeader: cfg.storefrontId,
      channelHeader: cfg.channel,
    },
    payload: {
      message: 'kontrakt routingu',
      storefrontId: 'body-only-storefront',
      channel: 'body-only-channel',
    },
    assertResult: assertJsonContentType,
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

function buildPayload(overrides = {}) {
  return {
    message: 'hej',
    stream: false,
    brand: cfg.brand,
    storefrontId: 'body-storefront',
    channel: 'body-channel',
    ...overrides,
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

async function sendIngressRequest(
  { secret, storefrontIdHeader, channelHeader } = {},
  payloadOverrides = {},
) {
  const response = await fetch(cfg.ingressUrl, {
    method: 'POST',
    headers: buildHeaders({ secret, storefrontIdHeader, channelHeader }),
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

async function main() {
  assertConfig();

  let failures = 0;

  console.log('EPIR ingress conformance test');
  console.log(`Target: ${cfg.ingressUrl}`);

  for (const scenario of scenarios) {
    try {
      const result = await sendIngressRequest(scenario.headers, scenario.payload);
      if (result.status !== scenario.expectedStatus) {
        failures += 1;
        console.error(
          `❌ ${scenario.name} -> expected ${scenario.expectedStatus}, got ${result.status} | content-type=${result.contentType || '<none>'} | body=${result.preview}`,
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

  console.log('✅ Wszystkie scenariusze ingress P0/P1 przeszły pomyślnie.');
}

await main();
