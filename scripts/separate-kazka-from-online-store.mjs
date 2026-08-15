#!/usr/bin/env node
/**
 * Separacja marek EPIR vs Kazka:
 * 1) Kolekcje kazka-* zdejmowane z Online Store (produkty Kazka zostają tylko na Headless Kazka).
 * 2) Tagi kategorii Kazka: kazka-pierscionek / kazka-naszyjnik / kazka-kolczyki / kazka-bransoletka / kazka-lab
 *    (bez wspólnych Pierścionek/Naszyjnik/Kolczyki z kolekcjami srebra EPIR).
 * 3) Smart kolekcje EPIR: VENDOR NOT_EQUALS Kazka + TAG NOT_EQUALS kazka.
 *
 *   node scripts/separate-kazka-from-online-store.mjs --dry-run
 *   node scripts/separate-kazka-from-online-store.mjs
 */
import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const OS_PUBLICATION_ID = 'gid://shopify/Publication/38413434985';
const THROTTLE_MS = 450;
const DRY_RUN = process.argv.includes('--dry-run');

const COLLIDING_TAGS = new Set(
  [
    'pierścionek',
    'naszyjnik',
    'kolczyk',
    'kolczyki',
    'bransoletka',
    'lab',
  ].map((t) => t.toLocaleLowerCase('pl')),
);

const TYPE_TO_KAZKA_TAG = {
  pierścionek: 'kazka-pierscionek',
  naszyjnik: 'kazka-naszyjnik',
  kolczyki: 'kazka-kolczyki',
  kolczyk: 'kazka-kolczyki',
  bransoletka: 'kazka-bransoletka',
};

const KAZKA_COLLECTION_TAG_RULES = {
  kazka: [{column: 'TAG', relation: 'EQUALS', condition: 'kazka'}],
  'kazka-jewelry': [{column: 'TAG', relation: 'EQUALS', condition: 'kazka'}],
  'kazka-pierscionki': [
    {column: 'TAG', relation: 'EQUALS', condition: 'kazka-pierscionek'},
  ],
  'kazka-naszyjniki': [
    {column: 'TAG', relation: 'EQUALS', condition: 'kazka-naszyjnik'},
  ],
  'kazka-kolczyki': [
    {column: 'TAG', relation: 'EQUALS', condition: 'kazka-kolczyki'},
  ],
  'kazka-bransoletki': [
    {column: 'TAG', relation: 'EQUALS', condition: 'kazka-bransoletka'},
  ],
};

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(dir, '../.dev.vars'), join(dir, './.dev.vars')]) {
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
const SHOP = (process.env.SHOP || fromDev.shop || DEFAULT_SHOP).replace(
  /^https?:\/\//,
  '',
);
if (!TOKEN) {
  console.error('Brak SHOPIFY_ADMIN_TOKEN');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}) {
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

function kazkaCategoryTag(product) {
  const type = String(product.productType || '')
    .trim()
    .toLocaleLowerCase('pl');
  if (TYPE_TO_KAZKA_TAG[type]) return TYPE_TO_KAZKA_TAG[type];
  const tags = (product.tags || []).map((t) => t.toLocaleLowerCase('pl'));
  for (const [from, to] of Object.entries(TYPE_TO_KAZKA_TAG)) {
    if (tags.includes(from)) return to;
  }
  return null;
}

function desiredTags(product) {
  const next = [];
  const seen = new Set();
  const add = (tag) => {
    const key = tag.toLocaleLowerCase('pl');
    if (!tag || seen.has(key) || COLLIDING_TAGS.has(key)) return;
    seen.add(key);
    next.push(tag);
  };
  for (const t of product.tags || []) add(t);
  add('kazka');
  const cat = kazkaCategoryTag(product);
  if (cat) add(cat);
  const hadLab = (product.tags || []).some(
    (t) => t.toLocaleLowerCase('pl') === 'lab',
  );
  if (hadLab) add('kazka-lab');
  return next;
}

function tagsEqual(a, b) {
  const norm = (arr) =>
    [...arr].map((t) => t.toLocaleLowerCase('pl')).sort().join('\0');
  return norm(a) === norm(b);
}

async function paginateProducts() {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(
      `query ($c: String) {
        products(first: 50, after: $c, query: "tag:kazka OR vendor:Kazka") {
          pageInfo { hasNextPage endCursor }
          nodes { id handle vendor productType tags }
        }
      }`,
      {c: cursor},
    );
    out.push(...data.products.nodes);
    cursor = data.products.pageInfo.hasNextPage
      ? data.products.pageInfo.endCursor
      : null;
  } while (cursor);
  return out;
}

async function paginateCollections() {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(
      `query ($c: String) {
        collections(first: 50, after: $c) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id handle title
            publishedOnOs: publishedOnPublication(publicationId: "${OS_PUBLICATION_ID}")
            ruleSet {
              appliedDisjunctively
              rules { column relation condition }
            }
          }
        }
      }`,
      {c: cursor},
    );
    out.push(...data.collections.nodes);
    cursor = data.collections.pageInfo.hasNextPage
      ? data.collections.pageInfo.endCursor
      : null;
  } while (cursor);
  return out;
}

const COLLECTION_UPDATE = `#graphql
  mutation UpdateRules($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE = `#graphql
  mutation SetTags($input: ProductUpdateInput!) {
    productUpdate(product: $input) {
      userErrors { field message }
    }
  }
`;

const UNPUBLISH = `#graphql
  mutation Unpublish($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

function withEpirExclusions(ruleSet) {
  const rules = [...(ruleSet?.rules || [])];
  const hasVendor = rules.some(
    (r) =>
      r.column === 'VENDOR' &&
      r.relation === 'NOT_EQUALS' &&
      r.condition === 'Kazka',
  );
  const hasTag = rules.some(
    (r) =>
      r.column === 'TAG' &&
      r.relation === 'NOT_EQUALS' &&
      String(r.condition).toLowerCase() === 'kazka',
  );
  if (!hasVendor) {
    rules.push({column: 'VENDOR', relation: 'NOT_EQUALS', condition: 'Kazka'});
  }
  if (!hasTag) {
    rules.push({column: 'TAG', relation: 'NOT_EQUALS', condition: 'kazka'});
  }
  return {appliedDisjunctively: false, rules};
}

async function main() {
  console.log(DRY_RUN ? 'DRY-RUN' : 'APPLY');
  const collections = await paginateCollections();
  const products = await paginateProducts();
  console.log(`collections=${collections.length} kazkaProducts=${products.length}`);

  for (const c of collections) {
    if (!c.handle.startsWith('kazka')) continue;
    if (!c.publishedOnOs) continue;
    console.log(`UNPUBLISH OS collection ${c.handle}`);
    if (!DRY_RUN) {
      const r = await gql(UNPUBLISH, {
        id: c.id,
        input: [{publicationId: OS_PUBLICATION_ID}],
      });
      const err = r.publishableUnpublish.userErrors;
      if (err?.length) console.error(c.handle, err);
      await sleep(THROTTLE_MS);
    }
  }

  let tagChanges = 0;
  for (const p of products) {
    const next = desiredTags(p);
    if (tagsEqual(p.tags, next)) continue;
    tagChanges += 1;
    console.log(`TAGS ${p.handle}: ${p.tags.join('|')} -> ${next.join('|')}`);
    if (!DRY_RUN) {
      const r = await gql(PRODUCT_UPDATE, {
        input: {id: p.id, tags: next},
      });
      const err = r.productUpdate.userErrors;
      if (err?.length) console.error(p.handle, err);
      await sleep(THROTTLE_MS);
    }
  }
  console.log(`tag updates: ${tagChanges}`);

  for (const c of collections) {
    const kazkaRules = KAZKA_COLLECTION_TAG_RULES[c.handle];
    if (!kazkaRules || !c.ruleSet) continue;
    const current = JSON.stringify(c.ruleSet.rules);
    const next = JSON.stringify(kazkaRules);
    const disjunct = c.ruleSet.appliedDisjunctively;
    if (current === next && disjunct === false) continue;
    console.log(`RULES kazka ${c.handle} ->`, kazkaRules);
    if (!DRY_RUN) {
      const r = await gql(COLLECTION_UPDATE, {
        input: {
          id: c.id,
          ruleSet: {appliedDisjunctively: false, rules: kazkaRules},
        },
      });
      const err = r.collectionUpdate.userErrors;
      if (err?.length) console.error(c.handle, err);
      await sleep(THROTTLE_MS);
    }
  }

  for (const c of collections) {
    if (c.handle.startsWith('kazka')) continue;
    if (!c.ruleSet) continue;
    const next = withEpirExclusions(c.ruleSet);
    const same =
      JSON.stringify(c.ruleSet.rules) === JSON.stringify(next.rules) &&
      c.ruleSet.appliedDisjunctively === false;
    if (same) continue;
    console.log(`RULES epir ${c.handle} add NOT Kazka/kazka`);
    if (!DRY_RUN) {
      const r = await gql(COLLECTION_UPDATE, {
        input: {id: c.id, ruleSet: next},
      });
      const err = r.collectionUpdate.userErrors;
      if (err?.length) console.error(c.handle, err);
      await sleep(THROTTLE_MS);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
