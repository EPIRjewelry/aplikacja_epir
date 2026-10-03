#!/usr/bin/env node
/**
 * Aktywuje web pixel extension `extensions/my-web-pixel` na sklepie.
 * `shopify app deploy` publikuje bundle, ale rekord piksela powstaje dopiero
 * przez webPixelCreate. To nie jest wklejka Customer Events.
 *
 * Wymaga scope `write_pixels` i `read_customer_events` (shopify.app.toml)
 * oraz istniejącego tokenu Admin API (SHOPIFY_ADMIN_TOKEN). Nie dodaje sekretu.
 *
 *   node scripts/shopify/ensure-epir-web-pixel.mjs
 *   node scripts/shopify/ensure-epir-web-pixel.mjs --dry-run
 */

import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const ACCOUNT_ID = 'epir';
const PIXEL_ENDPOINT = 'https://asystent.epirbizuteria.pl';
const SETTINGS = {
  accountID: ACCOUNT_ID,
  pixelEndpoint: PIXEL_ENDPOINT,
};

const DRY_RUN = process.argv.includes('--dry-run');

const QUERY = `query EpirWebPixel {
  webPixel {
    id
    settings
  }
}`;

const CREATE = `mutation EpirWebPixelCreate($webPixel: WebPixelInput!) {
  webPixelCreate(webPixel: $webPixel) {
    userErrors { field message code }
    webPixel { id settings }
  }
}`;

const UPDATE = `mutation EpirWebPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
  webPixelUpdate(id: $id, webPixel: $webPixel) {
    userErrors { field message code }
    webPixel { id settings }
  }
}`;

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function normalizeShopHost(raw) {
  return trimVal(raw).replace(/^https?:\/\//i, '').split('/')[0];
}

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const paths = [join(dir, '../../.dev.vars'), join(dir, '../.dev.vars')];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop = content.match(/SHOP\s*=\s*(.+)/);
    const mShopAlt = content.match(/(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN)\s*=\s*(.+)/);
    const token = mToken ? trimVal(mToken[1]) : null;
    const shop = mShop
      ? trimVal(mShop[1])
      : mShopAlt
        ? normalizeShopHost(mShopAlt[1])
        : null;
    if (token || shop) return {token, shop};
  }
  return {token: null, shop: null};
}

function resolveAdminToken() {
  return (
    process.env.SHOPIFY_ADMIN_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_ACCESS_TOKEN ||
    null
  );
}

function settingsMatch(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed.accountID === ACCOUNT_ID && parsed.pixelEndpoint === PIXEL_ENDPOINT;
  } catch {
    return false;
  }
}

function printUserErrors(errors) {
  const list = Array.isArray(errors) ? errors : [];
  for (const err of list) {
    const field = Array.isArray(err.field) ? err.field.join('.') : err.field || '';
    console.error(`[ensure-epir-web-pixel] ${err.code || 'ERROR'} ${field} ${err.message || ''}`.trim());
  }
}

if (!DRY_RUN && (!resolveAdminToken() || !process.env.SHOP)) {
  const fromDev = loadFromDevVars();
  if (!resolveAdminToken() && fromDev.token) process.env.SHOPIFY_ADMIN_TOKEN = fromDev.token;
  if (!process.env.SHOP && fromDev.shop) process.env.SHOP = fromDev.shop;
}
if (!process.env.SHOP && process.env.SHOP_DOMAIN) process.env.SHOP = normalizeShopHost(process.env.SHOP_DOMAIN);
if (!process.env.SHOP && process.env.SHOPIFY_SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOPIFY_SHOP_DOMAIN);
}
if (!process.env.SHOP) process.env.SHOP = DEFAULT_SHOP;

const SHOP = process.env.SHOP;
const TOKEN = resolveAdminToken();

if (DRY_RUN) {
  console.log(
    `[ensure-epir-web-pixel] dry-run: webPixelCreate/Update settings accountID=${ACCOUNT_ID} pixelEndpoint=${PIXEL_ENDPOINT} shop=${SHOP}`,
  );
  process.exit(0);
}

if (!TOKEN) {
  console.error('[ensure-epir-web-pixel] Brak SHOPIFY_ADMIN_TOKEN.');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({query, variables}),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`[ensure-epir-web-pixel] HTTP ${res.status}`);
    process.exit(1);
  }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    for (const err of json.errors) {
      console.error(`[ensure-epir-web-pixel] ${err.message || 'graphql error'}`);
    }
    process.exit(1);
  }
  return json.data;
}

const input = {webPixel: {settings: JSON.stringify(SETTINGS)}};
const current = await gql(QUERY);
const existing = current?.webPixel ?? null;

if (!existing?.id) {
  const created = await gql(CREATE, input);
  const payload = created?.webPixelCreate;
  if (payload?.userErrors?.length) {
    printUserErrors(payload.userErrors);
    process.exit(1);
  }
  console.log(`[ensure-epir-web-pixel] created ${payload?.webPixel?.id || 'web pixel'}`);
  process.exit(0);
}

if (settingsMatch(existing.settings)) {
  console.log(`[ensure-epir-web-pixel] already active ${existing.id}`);
  process.exit(0);
}

const updated = await gql(UPDATE, {id: existing.id, ...input});
const payload = updated?.webPixelUpdate;
if (payload?.userErrors?.length) {
  printUserErrors(payload.userErrors);
  process.exit(1);
}
console.log(`[ensure-epir-web-pixel] updated ${payload?.webPixel?.id || existing.id}`);
