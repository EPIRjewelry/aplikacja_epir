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
import {EPIR_WEB_PIXEL_SETTINGS, reconcileEpirWebPixel} from './epir-web-pixel-record.mjs';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const ACCOUNT_ID = EPIR_WEB_PIXEL_SETTINGS.accountID;
const PIXEL_ENDPOINT = EPIR_WEB_PIXEL_SETTINGS.pixelEndpoint;

const DRY_RUN = process.argv.includes('--dry-run');

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
  return json;
}

const result = await reconcileEpirWebPixel((query, variables) => gql(query, variables));
if (!result.ok) {
  console.error(`[ensure-epir-web-pixel] ${result.error || 'graphql error'}`);
  process.exit(1);
}
if (result.action === 'created') {
  console.log(`[ensure-epir-web-pixel] created ${result.id || 'web pixel'}`);
} else if (result.action === 'updated') {
  console.log(`[ensure-epir-web-pixel] updated ${result.id || 'web pixel'}`);
} else {
  console.log(`[ensure-epir-web-pixel] already active ${result.id || 'web pixel'}`);
}
