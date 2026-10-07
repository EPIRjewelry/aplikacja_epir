#!/usr/bin/env node
/**
 * Inwentaryzacja metapól (PRODUCT / PRODUCTVARIANT) + opcje wariantów z licznościami.
 * Env: SHOPIFY_ADMIN_TOKEN, SHOP_DOMAIN (lub workers/chat/.dev.vars — nie commituj).
 * Wynik: workers/chat/tmp/facts-inventory.json
 */
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tmp');
const API_VERSION = '2026-04';

async function loadDevVars() {
  const p = join(root, '.dev.vars');
  if (!existsSync(p)) return;
  const text = await readFile(p, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function adminGraphql(shop, token, query, variables) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Admin GraphQL failed: ${JSON.stringify(json.errors || res.status)}`);
  }
  return json.data;
}

async function main() {
  await loadDevVars();
  const token = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  const shop = process.env.SHOP_DOMAIN?.trim();
  if (!token || !shop) {
    console.error('Ustaw SHOPIFY_ADMIN_TOKEN i SHOP_DOMAIN (lub .dev.vars).');
    process.exit(1);
  }

  await mkdir(outDir, {recursive: true});

  const defsQuery = `
    query($owner: MetafieldOwnerType!, $cursor: String) {
      metafieldDefinitions(first: 50, ownerType: $owner, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          name
          namespace
          key
          type { name }
          access { storefront }
        }
      }
    }
  `;

  async function allDefs(owner) {
    const nodes = [];
    let cursor = null;
    for (;;) {
      const data = await adminGraphql(shop, token, defsQuery, {owner, cursor});
      const conn = data.metafieldDefinitions;
      nodes.push(...(conn.nodes || []));
      if (!conn.pageInfo?.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }
    return nodes;
  }

  const productDefs = await allDefs('PRODUCT');
  const variantDefs = await allDefs('PRODUCTVARIANT');

  const optionCounts = new Map();
  let cursor = null;
  let pages = 0;
  for (;;) {
    const data = await adminGraphql(
      shop,
      token,
      `query($cursor: String) {
        products(first: 50, after: $cursor, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes {
            options { name values }
            variants(first: 50) {
              nodes { selectedOptions { name value } }
            }
          }
        }
      }`,
      {cursor},
    );
    pages += 1;
    for (const p of data.products?.nodes || []) {
      for (const v of p.variants?.nodes || []) {
        for (const o of v.selectedOptions || []) {
          const key = `${o.name}|||${o.value}`;
          optionCounts.set(key, (optionCounts.get(key) || 0) + 1);
        }
      }
    }
    if (!data.products?.pageInfo?.hasNextPage || pages > 40) break;
    cursor = data.products.pageInfo.endCursor;
  }

  const options = [...optionCounts.entries()]
    .map(([k, count]) => {
      const [name, value] = k.split('|||');
      return {name, value, count};
    })
    .sort((a, b) => b.count - a.count);

  const report = {
    generatedAt: new Date().toISOString(),
    shop,
    metafieldDefinitions: {
      PRODUCT: productDefs,
      PRODUCTVARIANT: variantDefs,
    },
    variantOptions: options,
    note: 'Bez wartości sekretów. Storefront access z access.storefront.',
  };

  const outPath = join(outDir, 'facts-inventory.json');
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log('Zapisano', outPath, `(options=${options.length}, pages=${pages})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
