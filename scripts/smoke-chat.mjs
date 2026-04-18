#!/usr/bin/env node
/**
 * Smoke test dla endpointu /apps/assistant/chat za App Proxy (HMAC-SHA256).
 *
 * Generuje `signature` zgodny z Shopify App Proxy (canonical string query params,
 * posortowany, duplikaty łączone przecinkiem, bez separatorów) i strzela POST-em.
 * Oczekiwany wynik: HTTP 200 z JSON-em / streamem od `epir-art-jewellery-worker`.
 *
 * Użycie (PowerShell):
 *   $env:SHOPIFY_APP_SECRET = "shpss_..."
 *   node scripts/smoke-chat.mjs --message "Dzień dobry" --stream false
 *
 * Zmienne środowiskowe:
 *   SHOPIFY_APP_SECRET            – wymagane, sekret App Proxy (Shopify admin)
 *   EPIR_SMOKE_BASE_URL           – domyślnie https://asystent.epirbizuteria.pl
 *   EPIR_SMOKE_SHOP               – domyślnie epir-art-silver-jewellery.myshopify.com
 *   EPIR_SMOKE_CUSTOMER_ID        – opcjonalnie `logged_in_customer_id`
 *   EPIR_SMOKE_PATH_PREFIX        – domyślnie /apps/assistant
 *
 * UWAGA: nie commituj sekretów – skrypt czyta je wyłącznie ze środowiska.
 */

import { createHmac } from 'node:crypto';
import { parseArgs } from 'node:util';

const DEFAULT_BASE = process.env.EPIR_SMOKE_BASE_URL ?? 'https://asystent.epirbizuteria.pl';
const DEFAULT_SHOP = process.env.EPIR_SMOKE_SHOP ?? 'epir-art-silver-jewellery.myshopify.com';
const DEFAULT_PATH_PREFIX = process.env.EPIR_SMOKE_PATH_PREFIX ?? '/apps/assistant';

const { values } = parseArgs({
  options: {
    message: { type: 'string', default: 'smoke test – ignoruj' },
    stream: { type: 'string', default: 'false' },
    brand: { type: 'string', default: 'epir' },
    base: { type: 'string', default: DEFAULT_BASE },
    shop: { type: 'string', default: DEFAULT_SHOP },
    customer: { type: 'string', default: process.env.EPIR_SMOKE_CUSTOMER_ID ?? '' },
    'path-prefix': { type: 'string', default: DEFAULT_PATH_PREFIX },
    verbose: { type: 'boolean', default: false },
  },
});

const secret = process.env.SHOPIFY_APP_SECRET;
if (!secret) {
  console.error('Brak SHOPIFY_APP_SECRET w środowisku. Przerwano.');
  process.exit(2);
}

/** Canonical query string wg Shopify App Proxy. */
function shopifyAppProxyCanonical(params) {
  const excluded = new Set(['signature', 'hmac', 'shopify_hmac']);
  const byKey = new Map();
  for (const [key, value] of params.entries()) {
    if (excluded.has(key)) continue;
    const list = byKey.get(key) ?? [];
    list.push(value);
    byKey.set(key, list);
  }
  const pieces = [];
  for (const [key, values] of byKey.entries()) {
    pieces.push(`${key}=${values.join(',')}`);
  }
  pieces.sort((a, b) => a.localeCompare(b));
  return pieces.join('');
}

const url = new URL('/chat', values.base);
url.searchParams.set('shop', values.shop);
url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
url.searchParams.set('path_prefix', values['path-prefix']);
if (values.customer) {
  url.searchParams.set('logged_in_customer_id', values.customer);
}

const canonical = shopifyAppProxyCanonical(url.searchParams);
const signature = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
url.searchParams.set('signature', signature);

const body = JSON.stringify({
  message: values.message,
  stream: values.stream === 'true',
  brand: values.brand,
});

if (values.verbose) {
  console.error('[smoke] URL:', url.toString());
  console.error('[smoke] canonical:', canonical);
  console.error('[smoke] body:', body);
}

const started = Date.now();
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});
const elapsedMs = Date.now() - started;

const contentType = response.headers.get('content-type') ?? '';
const isStream = contentType.includes('text/event-stream');

let preview = '';
if (response.body && isStream) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let received = 0;
  while (received < 1024) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    chunks.push(text);
    received += text.length;
  }
  await reader.cancel().catch(() => {});
  preview = chunks.join('').slice(0, 1024);
} else {
  preview = (await response.text()).slice(0, 1024);
}

const summary = {
  status: response.status,
  ok: response.ok,
  elapsed_ms: elapsedMs,
  content_type: contentType,
  stream: isStream,
  preview: preview.replace(/\s+/g, ' ').trim(),
};

console.log(JSON.stringify(summary, null, 2));
process.exit(response.ok ? 0 : 1);
