#!/usr/bin/env node
/**
 * Import brakujących produktów LAB Kazka — tylko kanał Headless Kazka.
 *
 * Źródło JSON: D:/marketing/csv/produkty_kazka_shopify_nowe_lab.json
 * Publikacja: Epir Art Jewellery&KAZKA Jewelry (headless-storefronts)
 * NIE publikuje: Online Store, Pierścionki Zaręczynowe, Google, social.
 *
 *   node scripts/import-kazka-lab-new.mjs --dry-run
 *   node scripts/import-kazka-lab-new.mjs
 */
import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const KAZKA_PUBLICATION_ID = 'gid://shopify/Publication/332069732684';
const OS_PUBLICATION_ID = 'gid://shopify/Publication/38413434985';
const ZARECZYNY_PUBLICATION_ID = 'gid://shopify/Publication/333120209228';
const LOCATION_ID = 'gid://shopify/Location/31639339113';
const JSON_PATH = 'D:/marketing/csv/produkty_kazka_shopify_nowe_lab.json';
const THROTTLE_MS = 700;

const DRY_RUN = process.argv.includes('--dry-run');

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const paths = [join(dir, '../.dev.vars'), join(dir, './.dev.vars')];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop = content.match(/^SHOP\s*=\s*(.+)/m);
    return {
      token: mToken ? trimVal(mToken[1]) : null,
      shop: mShop ? trimVal(mShop[1]) : null,
    };
  }
  return {token: null, shop: null};
}

const fromDev = loadFromDevVars();
const TOKEN =
  process.env.SHOPIFY_ADMIN_TOKEN ||
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
  fromDev.token;
const SHOP = (
  process.env.SHOP ||
  fromDev.shop ||
  DEFAULT_SHOP
).replace(/^https?:\/\//, '');

if (!TOKEN) {
  console.error('Brak SHOPIFY_ADMIN_TOKEN');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function filenameFromUrl(url, fallback) {
  try {
    const base = new URL(url).pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(base || fallback);
  } catch {
    return fallback;
  }
}

const PRODUCT_SET = `#graphql
  mutation ImportKazkaLab($synchronous: Boolean!, $input: ProductSetInput!) {
    productSet(synchronous: $synchronous, input: $input) {
      product {
        id
        handle
        publishedOnOs: publishedOnPublication(publicationId: "${OS_PUBLICATION_ID}")
        publishedOnKazka: publishedOnPublication(publicationId: "${KAZKA_PUBLICATION_ID}")
        publishedOnZareczyny: publishedOnPublication(publicationId: "${ZARECZYNY_PUBLICATION_ID}")
      }
      userErrors { field message code }
    }
  }
`;

const PUBLISH = `#graphql
  mutation PublishKazka($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

const UNPUBLISH = `#graphql
  mutation UnpublishOther($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

const FIND = `#graphql
  query FindByHandle($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        publishedOnOs: publishedOnPublication(publicationId: "${OS_PUBLICATION_ID}")
        publishedOnKazka: publishedOnPublication(publicationId: "${KAZKA_PUBLICATION_ID}")
        publishedOnZareczyny: publishedOnPublication(publicationId: "${ZARECZYNY_PUBLICATION_ID}")
      }
    }
  }
`;

const STAGED = `#graphql
  mutation StagedVideoUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA = `#graphql
  mutation AttachVideo($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      mediaUserErrors { field message }
    }
  }
`;

async function ensurePublications(productId, flags) {
  if (!flags.publishedOnKazka) {
    const r = await shopifyGraphql(PUBLISH, {
      id: productId,
      input: [{publicationId: KAZKA_PUBLICATION_ID}],
    });
    const err = r.publishablePublish.userErrors;
    if (err?.length) throw new Error(`publish kazka: ${JSON.stringify(err)}`);
  }
  const unpub = [];
  if (flags.publishedOnOs) unpub.push({publicationId: OS_PUBLICATION_ID});
  if (flags.publishedOnZareczyny) {
    unpub.push({publicationId: ZARECZYNY_PUBLICATION_ID});
  }
  if (unpub.length) {
    const r = await shopifyGraphql(UNPUBLISH, {id: productId, input: unpub});
    const err = r.publishableUnpublish.userErrors;
    if (err?.length) throw new Error(`unpublish: ${JSON.stringify(err)}`);
  }
}

async function attachVideo(productId, videoUrl) {
  const head = await fetch(videoUrl, {method: 'HEAD'});
  if (!head.ok) throw new Error(`HEAD video ${head.status}`);
  const fileSize = head.headers.get('content-length');
  const filename = filenameFromUrl(videoUrl, 'product.mp4');
  const staged = await shopifyGraphql(STAGED, {
    input: [
      {
        resource: 'VIDEO',
        filename,
        mimeType: 'video/mp4',
        httpMethod: 'POST',
        fileSize: fileSize || '1',
      },
    ],
  });
  const err = staged.stagedUploadsCreate.userErrors;
  if (err?.length) throw new Error(JSON.stringify(err));
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  const bin = await fetch(videoUrl);
  form.append('file', await bin.blob(), filename);
  const up = await fetch(target.url, {method: 'POST', body: form});
  if (!up.ok) throw new Error(`staged POST ${up.status}`);
  const media = await shopifyGraphql(CREATE_MEDIA, {
    productId,
    media: [
      {
        originalSource: target.resourceUrl,
        alt: filename,
        mediaContentType: 'VIDEO',
      },
    ],
  });
  const mErr = media.productCreateMedia.mediaUserErrors;
  if (mErr?.length) throw new Error(JSON.stringify(mErr));
}

function toProductSetInput(p) {
  const carats = [...new Set(p.variants.map((v) => v.caratageGold))];
  const qualities = [...new Set(p.variants.map((v) => v.quality))];
  return {
    handle: p.handle,
    title: p.title,
    vendor: p.vendor,
    productType: p.productType,
    descriptionHtml: p.descriptionHtml,
    tags: p.tags,
    status: 'ACTIVE',
    productOptions: [
      {name: 'Próba złota', values: carats.map((name) => ({name}))},
      {name: 'Jakość', values: qualities.map((name) => ({name}))},
    ],
    files: p.images.map((url, i) => ({
      originalSource: url,
      alt: i === 0 ? p.title : `${p.title} ${i + 1}`,
      filename: filenameFromUrl(url, `image-${i + 1}.webp`),
      contentType: 'IMAGE',
    })),
    variants: p.variants.map((v) => ({
      sku: v.sku,
      price: v.price,
      optionValues: [
        {optionName: 'Próba złota', name: v.caratageGold},
        {optionName: 'Jakość', name: v.quality},
      ],
      inventoryPolicy: 'DENY',
      inventoryItem: {
        tracked: true,
        sku: v.sku,
        measurement: {
          weight: {value: Number(v.grams) || 0, unit: 'GRAMS'},
        },
      },
      inventoryQuantities: [
        {locationId: LOCATION_ID, name: 'available', quantity: 5},
      ],
    })),
  };
}

async function main() {
  if (!existsSync(JSON_PATH)) {
    console.error('Brak JSON:', JSON_PATH);
    process.exit(1);
  }
  const products = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  console.log(
    `${DRY_RUN ? 'DRY-RUN' : 'APPLY'} ${products.length} produktów → Headless Kazka only`,
  );

  for (const p of products) {
    const existing = await shopifyGraphql(FIND, {
      query: `handle:${p.handle}`,
    });
    const found = existing.products.nodes[0];
    if (found) {
      console.log(`SKIP exists ${p.handle} ${found.id}`);
      if (!DRY_RUN) {
        await ensurePublications(found.id, found);
      }
      await sleep(THROTTLE_MS);
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `WOULD CREATE ${p.handle} | ${p.title} | type=${p.productType} | variants=${p.variants.length} | img=${p.images.length} | vid=${p.videos.length}`,
      );
      continue;
    }

    const data = await shopifyGraphql(PRODUCT_SET, {
      synchronous: true,
      input: toProductSetInput(p),
    });
    const errors = data.productSet.userErrors;
    if (errors?.length) {
      console.error(`FAIL ${p.handle}`, JSON.stringify(errors));
      continue;
    }
    const product = data.productSet.product;
    console.log(`CREATED ${p.handle} ${product.id}`);
    await ensurePublications(product.id, product);
    console.log(`  published: kazka=yes os=no zareczyny=no`);

    for (const videoUrl of p.videos || []) {
      try {
        await attachVideo(product.id, videoUrl);
        console.log(`  video ok`);
      } catch (e) {
        console.error(`  video fail ${p.handle}: ${e.message}`);
      }
      await sleep(THROTTLE_MS);
    }
    await sleep(THROTTLE_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
