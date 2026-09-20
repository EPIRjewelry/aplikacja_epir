#!/usr/bin/env node
/**
 * Audyt + utworzenie smart kolekcji Kazka (kategorie + linie).
 *
 *   node scripts/ensure-kazka-collections.mjs           → dry-run
 *   node scripts/ensure-kazka-collections.mjs --apply   → tworzy brakujące
 */
import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const KAZKA_PUBLICATION_ID = 'gid://shopify/Publication/332069732684';
const OS_PUBLICATION_ID = 'gid://shopify/Publication/38413434985';
const THROTTLE_MS = 500;
const DRY_RUN = !process.argv.includes('--apply');

/** Smart kolekcje Kazka — handlе + reguły tagów (jak separate-kazka-from-online-store). */
const KAZKA_SMART_COLLECTIONS = {
  'kazka-pierscionki': {
    title: 'Pierścionki Kazka',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'kazka-pierscionek'}],
  },
  'kazka-naszyjniki': {
    title: 'Naszyjniki Kazka',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'kazka-naszyjnik'}],
  },
  'kazka-kolczyki': {
    title: 'Kolczyki Kazka',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'kazka-kolczyki'}],
  },
  'kazka-bransoletki': {
    title: 'Bransoletki Kazka',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'kazka-bransoletka'}],
  },
  'kazka-classic': {
    title: 'Classic',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'kazka-classic'}],
  },
  'kazka-big-lab': {
    title: 'Big Lab',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'kazka-lab'}],
  },
  'kazka-fancy-cut': {
    title: 'Fancy Cut',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'FANCY_CUT'}],
  },
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
            publishedOnKazka: publishedOnPublication(publicationId: "${KAZKA_PUBLICATION_ID}")
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

const COLLECTION_CREATE = `#graphql
  mutation CreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id handle title }
      userErrors { field message }
    }
  }
`;

const COLLECTION_UPDATE = `#graphql
  mutation UpdateCollection($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      userErrors { field message }
    }
  }
`;

const PUBLISH = `#graphql
  mutation Publish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
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

function rulesMatch(collection, expectedRules) {
  const current = collection.ruleSet?.rules ?? [];
  if (current.length !== expectedRules.length) return false;
  const norm = (rules) =>
    JSON.stringify(
      rules
        .map((r) => ({
          column: r.column,
          relation: r.relation,
          condition: r.condition,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  return norm(current) === norm(expectedRules);
}

async function main() {
  console.log(`MODE: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`shop=${SHOP}`);

  const collections = await paginateCollections();
  const byHandle = new Map(collections.map((c) => [c.handle, c]));

  const handles = Object.keys(KAZKA_SMART_COLLECTIONS);
  console.log('\n--- AUDYT ---');
  for (const handle of handles) {
    const c = byHandle.get(handle);
    if (!c) {
      console.log(`MISSING  ${handle}`);
      continue;
    }
    const expected = KAZKA_SMART_COLLECTIONS[handle].rules;
    const rulesOk = rulesMatch(c, expected);
    console.log(
      `OK       ${handle} | kazkaPub=${c.publishedOnKazka} osPub=${c.publishedOnOs} rules=${rulesOk ? 'ok' : 'MISMATCH'}`,
    );
  }

  let created = 0;
  let updated = 0;

  for (const [handle, spec] of Object.entries(KAZKA_SMART_COLLECTIONS)) {
    const existing = byHandle.get(handle);
    const ruleSet = {appliedDisjunctively: false, rules: spec.rules};

    if (!existing) {
      console.log(`\nCREATE ${handle} (${spec.title})`);
      if (!DRY_RUN) {
        const r = await gql(COLLECTION_CREATE, {
          input: {title: spec.title, handle, ruleSet},
        });
        const err = r.collectionCreate.userErrors;
        if (err?.length) {
          console.error('  ERROR', err);
          continue;
        }
        const id = r.collectionCreate.collection.id;
        byHandle.set(handle, {id, handle, publishedOnKazka: false, publishedOnOs: false});
        created++;
        await sleep(THROTTLE_MS);

        const pub = await gql(PUBLISH, {
          id,
          input: [{publicationId: KAZKA_PUBLICATION_ID}],
        });
        if (pub.publishablePublish.userErrors?.length) {
          console.error('  PUBLISH KAZKA', pub.publishablePublish.userErrors);
        }
        await sleep(THROTTLE_MS);
      }
      continue;
    }

    if (!rulesMatch(existing, spec.rules)) {
      console.log(`\nUPDATE RULES ${handle}`);
      if (!DRY_RUN) {
        const r = await gql(COLLECTION_UPDATE, {
          input: {id: existing.id, ruleSet},
        });
        if (r.collectionUpdate.userErrors?.length) {
          console.error('  ERROR', r.collectionUpdate.userErrors);
        } else {
          updated++;
        }
        await sleep(THROTTLE_MS);
      }
    }

    if (!existing.publishedOnKazka) {
      console.log(`PUBLISH KAZKA ${handle}`);
      if (!DRY_RUN) {
        const r = await gql(PUBLISH, {
          id: existing.id,
          input: [{publicationId: KAZKA_PUBLICATION_ID}],
        });
        if (r.publishablePublish.userErrors?.length) {
          console.error('  ERROR', r.publishablePublish.userErrors);
        }
        await sleep(THROTTLE_MS);
      }
    }

    if (existing.publishedOnOs) {
      console.log(`UNPUBLISH OS ${handle}`);
      if (!DRY_RUN) {
        const r = await gql(UNPUBLISH, {
          id: existing.id,
          input: [{publicationId: OS_PUBLICATION_ID}],
        });
        if (r.publishableUnpublish.userErrors?.length) {
          console.error('  ERROR', r.publishableUnpublish.userErrors);
        }
        await sleep(THROTTLE_MS);
      }
    }
  }

  console.log(
    `\nGotowe. created=${created} rulesUpdated=${updated} ${DRY_RUN ? '(dry-run)' : ''}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
