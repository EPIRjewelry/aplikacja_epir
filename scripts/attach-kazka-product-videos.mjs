#!/usr/bin/env node
/**
 * Przypisuje wideo produktowe (.mp4 z S3) do produktów Kazka w Shopify.
 *
 * Źródło: CSV z kolumną Image Src (URL .mp4) → mapowanie po Handle.
 * Zakres: tylko produkty z tagiem `kazka` (kanał Headless Kazka).
 * Pomija produkty, które już mają media VIDEO / EXTERNAL_VIDEO.
 * Upload: stagedUploadsCreate (Shopify nie akceptuje surowych URL-i S3 dla VIDEO).
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API epir_ai.
 * Nie używa tokenów Hydrogen (apps/kazka, apps/zareczyny).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN (scope: read_products, write_products, write_files)
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 *
 * Uruchom:
 *   node scripts/attach-kazka-product-videos.mjs --dry-run
 *   node scripts/attach-kazka-product-videos.mjs --limit 5
 *   node scripts/attach-kazka-product-videos.mjs
 *   node scripts/attach-kazka-product-videos.mjs --csv "D:/marketing/csv/produkty_kazka_shopify.csv"
 */

import {readFileSync, existsSync, writeFileSync} from 'fs';
import {dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const DEFAULT_CSV = 'D:/marketing/csv/produkty_kazka_shopify.csv';
const REQUIRED_TAG = 'kazka';
const THROTTLE_MS = 600;
/** Shopify: max ~200 video uploads / hour */
const RATE_LIMIT_WAIT_MS = 65 * 60 * 1000;

function isVideoRateLimitError(message) {
  return /more than 200 videos in an hour/i.test(String(message || ''));
}

const DRY_RUN = process.argv.includes('--dry-run');

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const LIMIT_RAW = readArg('--limit');
const LIMIT = LIMIT_RAW ? Number(LIMIT_RAW) : null;
const CSV_PATH = resolve(readArg('--csv') || DEFAULT_CSV);
const ONLY_HANDLE = readArg('--handle');

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function normalizeShopHost(raw) {
  let s = trimVal(raw);
  s = s.replace(/^https?:\/\//i, '').split('/')[0];
  return s;
}

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const paths = [join(dir, '../.dev.vars'), join(dir, './.dev.vars')];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop = content.match(/SHOP\s*=\s*(.+)/);
    const mShopAlt = content.match(
      /(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN)\s*=\s*(.+)/,
    );
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

if (!resolveAdminToken() || !process.env.SHOP) {
  const fromDev = loadFromDevVars();
  if (!resolveAdminToken() && fromDev.token) {
    process.env.SHOPIFY_ADMIN_TOKEN = fromDev.token;
  }
  if (!process.env.SHOP && fromDev.shop) process.env.SHOP = fromDev.shop;
}
if (!process.env.SHOP && process.env.SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOP_DOMAIN);
}
if (!process.env.SHOP && process.env.SHOPIFY_SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOPIFY_SHOP_DOMAIN);
}
if (!process.env.SHOP && process.env.SHOPIFY_STORE_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOPIFY_STORE_DOMAIN);
}
if (!process.env.SHOP) {
  process.env.SHOP = DEFAULT_SHOP;
}

const SHOP = process.env.SHOP;
const TOKEN = resolveAdminToken();

if (!TOKEN) {
  console.error(
    'Brak SHOPIFY_ADMIN_TOKEN (token Admin API sklepu Liquid / epir_ai).',
  );
  console.error(
    'Ustaw env lub root/.dev.vars — nie używaj tokenów z apps/kazka ani apps/zareczyny.',
  );
  console.error('Wymagane scope: read_products, write_products, write_files');
  process.exit(1);
}

if (!existsSync(CSV_PATH)) {
  console.error(`Brak pliku CSV: ${CSV_PATH}`);
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimalny parser CSV z obsługą cudzysłowów i multiline. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignore CR; LF ends the row
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function loadVideoMapFromCsv(csvPath) {
  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error('CSV jest pusty');
  }

  const header = rows[0].map((h) => h.trim());
  const handleIdx = header.indexOf('Handle');
  const imageIdx = header.indexOf('Image Src');
  if (handleIdx === -1 || imageIdx === -1) {
    throw new Error('CSV musi mieć kolumny Handle oraz Image Src');
  }

  /** @type {Map<string, string>} */
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const handle = (cols[handleIdx] || '').trim();
    const src = (cols[imageIdx] || '').trim();
    if (!handle || !src) continue;
    if (!/\.mp4($|\?)/i.test(src)) continue;
    if (!map.has(handle)) map.set(handle, src);
  }
  return map;
}

async function shopifyGraphql(query, variables = {}) {
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
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductForVideoAttach($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        title
        tags
        status
        media(first: 50) {
          nodes {
            mediaContentType
            ... on Video {
              id
              filename
              originalSource {
                url
              }
            }
            ... on ExternalVideo {
              id
              embeddedUrl
            }
          }
        }
      }
    }
  }
`;

const STAGED_UPLOADS_CREATE = `#graphql
  mutation StagedVideoUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_CREATE_MEDIA = `#graphql
  mutation AttachProductVideo($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        alt
        mediaContentType
        status
        ... on Video {
          id
          filename
        }
      }
      mediaUserErrors {
        field
        message
        code
      }
      product {
        id
        handle
      }
    }
  }
`;

function hasTag(tags, tag) {
  const needle = String(tag).toLowerCase();
  return (tags || []).some((t) => String(t).toLowerCase() === needle);
}

function productHasVideo(mediaNodes) {
  return (mediaNodes || []).some(
    (m) =>
      m.mediaContentType === 'VIDEO' || m.mediaContentType === 'EXTERNAL_VIDEO',
  );
}

function filenameFromUrl(url) {
  try {
    const u = new URL(url);
    const base = u.pathname.split('/').filter(Boolean).pop() || 'product.mp4';
    return decodeURIComponent(base);
  } catch {
    return 'product.mp4';
  }
}

async function fetchProduct(handle) {
  const data = await shopifyGraphql(PRODUCT_BY_HANDLE_QUERY, {
    query: `handle:${handle}`,
  });
  return data?.products?.nodes?.[0] ?? null;
}

/**
 * Shopify nie przyjmuje surowych URL-i S3 dla VIDEO — wymagany staged upload:
 * HEAD (size) → stagedUploadsCreate → POST multipart → productCreateMedia(resourceUrl).
 */
async function stageVideoFromUrl(videoUrl) {
  const head = await fetch(videoUrl, {method: 'HEAD'});
  if (!head.ok) {
    throw new Error(`HEAD ${videoUrl} → HTTP ${head.status}`);
  }
  const fileSize = head.headers.get('content-length');
  if (!fileSize) {
    throw new Error(`Brak Content-Length dla ${videoUrl}`);
  }
  const mimeType = head.headers.get('content-type') || 'video/mp4';
  const filename = filenameFromUrl(videoUrl);

  const stagedData = await shopifyGraphql(STAGED_UPLOADS_CREATE, {
    input: [
      {
        filename,
        mimeType: mimeType.split(';')[0].trim() || 'video/mp4',
        fileSize: String(fileSize),
        resource: 'VIDEO',
        httpMethod: 'POST',
      },
    ],
  });

  const stagedErrors = stagedData?.stagedUploadsCreate?.userErrors || [];
  if (stagedErrors.length) {
    throw new Error(stagedErrors.map((e) => e.message).join('; '));
  }
  const target = stagedData?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) {
    throw new Error('Brak stagedTarget z stagedUploadsCreate');
  }

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`GET ${videoUrl} → HTTP ${videoRes.status}`);
  }
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Pusty plik wideo: ${videoUrl}`);
  }

  const form = new FormData();
  for (const p of target.parameters || []) {
    form.append(p.name, p.value);
  }
  form.append(
    'file',
    new Blob([buffer], {type: mimeType.split(';')[0].trim() || 'video/mp4'}),
    filename,
  );

  const uploadRes = await fetch(target.url, {method: 'POST', body: form});
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '');
    throw new Error(
      `Staged upload HTTP ${uploadRes.status}: ${body.slice(0, 300)}`,
    );
  }

  return target.resourceUrl;
}

async function attachVideo(productId, videoUrl, alt) {
  const resourceUrl = await stageVideoFromUrl(videoUrl);
  const data = await shopifyGraphql(PRODUCT_CREATE_MEDIA, {
    productId,
    media: [
      {
        originalSource: resourceUrl,
        mediaContentType: 'VIDEO',
        alt: alt || filenameFromUrl(videoUrl),
      },
    ],
  });
  return data.productCreateMedia;
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`CSV: ${CSV_PATH}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  if (LIMIT != null) console.log(`Limit: ${LIMIT}`);
  if (ONLY_HANDLE) console.log(`Handle: ${ONLY_HANDLE}`);

  const videoMap = loadVideoMapFromCsv(CSV_PATH);
  let entries = [...videoMap.entries()];
  if (ONLY_HANDLE) {
    entries = entries.filter(([h]) => h === ONLY_HANDLE);
  }
  if (LIMIT != null && Number.isFinite(LIMIT) && LIMIT > 0) {
    entries = entries.slice(0, LIMIT);
  }

  console.log(`Wideo w CSV (unikalne handle): ${videoMap.size}`);
  console.log(`Do przetworzenia teraz: ${entries.length}`);

  const summary = {
    attached: 0,
    skippedHasVideo: 0,
    skippedNoTag: 0,
    missing: 0,
    errors: 0,
  };
  /** @type {Array<{handle: string, status: string, detail?: string}>} */
  const log = [];

  for (let i = 0; i < entries.length; i++) {
    const [handle, videoUrl] = entries[i];
    const n = `${i + 1}/${entries.length}`;
    let done = false;

    while (!done) {
      try {
        const product = await fetchProduct(handle);
        if (!product) {
          summary.missing++;
          log.push({handle, status: 'missing'});
          console.log(`[${n}] MISSING ${handle}`);
          done = true;
          break;
        }

        if (!hasTag(product.tags, REQUIRED_TAG)) {
          summary.skippedNoTag++;
          log.push({
            handle,
            status: 'skipped_no_kazka_tag',
            detail: product.id,
          });
          console.log(`[${n}] SKIP (no tag kazka) ${handle}`);
          done = true;
          break;
        }

        if (productHasVideo(product.media?.nodes)) {
          summary.skippedHasVideo++;
          log.push({handle, status: 'skipped_has_video', detail: product.id});
          console.log(`[${n}] SKIP (already has video) ${handle}`);
          done = true;
          break;
        }

        if (DRY_RUN) {
          summary.attached++;
          log.push({
            handle,
            status: 'would_attach',
            detail: `${product.id} <- ${videoUrl}`,
          });
          console.log(`[${n}] WOULD ATTACH ${handle} <- ${videoUrl}`);
          done = true;
          break;
        }

        const result = await attachVideo(product.id, videoUrl, product.title);
        const errs = result?.mediaUserErrors || [];
        if (errs.length) {
          const msg = errs.map((e) => e.message).join('; ');
          if (isVideoRateLimitError(msg)) {
            console.warn(
              `[${n}] RATE LIMIT — czekam ${Math.round(RATE_LIMIT_WAIT_MS / 60000)} min, potem retry ${handle}`,
            );
            await sleep(RATE_LIMIT_WAIT_MS);
            continue;
          }
          summary.errors++;
          log.push({handle, status: 'error', detail: msg});
          console.error(`[${n}] ERROR ${handle}: ${msg}`);
          done = true;
          break;
        }

        summary.attached++;
        const mediaStatus = result?.media?.[0]?.status || 'ok';
        log.push({
          handle,
          status: 'attached',
          detail: `${result?.media?.[0]?.id || ''} ${mediaStatus}`,
        });
        console.log(`[${n}] ATTACHED ${handle} (${mediaStatus})`);
        done = true;
      } catch (err) {
        const msg = err?.message || String(err);
        if (isVideoRateLimitError(msg)) {
          console.warn(
            `[${n}] RATE LIMIT — czekam ${Math.round(RATE_LIMIT_WAIT_MS / 60000)} min, potem retry ${handle}`,
          );
          await sleep(RATE_LIMIT_WAIT_MS);
          continue;
        }
        summary.errors++;
        log.push({handle, status: 'error', detail: msg});
        console.error(`[${n}] ERROR ${handle}: ${msg}`);
        done = true;
      }
    }

    await sleep(THROTTLE_MS);
  }

  const reportPath = join(
    dirname(fileURLToPath(import.meta.url)),
    `attach-kazka-videos-${DRY_RUN ? 'dryrun' : 'apply'}-${Date.now()}.json`,
  );
  writeFileSync(
    reportPath,
    JSON.stringify({summary, csv: CSV_PATH, shop: SHOP, log}, null, 2),
    'utf8',
  );

  console.log('\n--- Summary ---');
  console.log(summary);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
