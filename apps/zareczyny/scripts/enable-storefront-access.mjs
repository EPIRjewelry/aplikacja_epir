#!/usr/bin/env node
/**
 * Włącza Storefront API access (PUBLIC_READ) dla definicji metaobiektów Route,
 * Section Hero, Section Featured Collections, Section Featured Products.
 * Wymaga: SHOPIFY_ADMIN_ACCESS_TOKEN (Custom App z scope write_metaobject_definitions)
 * Uruchom: node scripts/enable-storefront-access.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const paths = [join(dir, '../.dev.vars'), join(dir, '../../.dev.vars')];
  for (const p of paths) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      const m = content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
  const token = loadFromDevVars();
  if (token) process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = token;
}

const SHOP = 'epir-art-silver-jewellery.myshopify.com';
const API_VERSION = '2024-01';

const DEFINITIONS = [
  { id: 'gid://shopify/MetaobjectDefinition/34416296268', name: 'Route' },
  { id: 'gid://shopify/MetaobjectDefinition/34415870284', name: 'Section Hero' },
  { id: 'gid://shopify/MetaobjectDefinition/34415903052', name: 'Section Featured Products' },
  { id: 'gid://shopify/MetaobjectDefinition/34416230732', name: 'Section Featured Collections' },
];

const mutation = `mutation EnableStorefrontAccess($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
  metaobjectDefinitionUpdate(id: $id, definition: $definition) {
    metaobjectDefinition { id name type }
    userErrors { field message code }
  }
}`;

async function main() {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) {
    console.error('Brak SHOPIFY_ADMIN_ACCESS_TOKEN. Ustaw zmienną środowiskową lub dodaj do .dev.vars');
    console.error('Token: Shopify Admin → Settings → Apps → Develop apps → write_metaobject_definitions');
    process.exit(1);
  }

  const url = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

  for (const def of DEFINITIONS) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          id: def.id,
          definition: { access: { storefront: 'PUBLIC_READ' } },
        },
      }),
    });

    const json = await res.json();
    const data = json?.data?.metaobjectDefinitionUpdate;
    const errors = json?.errors || data?.userErrors || [];

    if (errors.length > 0) {
      console.error(`Błąd dla ${def.name}:`, JSON.stringify(errors, null, 2));
      continue;
    }

    console.log(`OK: ${def.name} – Storefront API access włączony`);
  }

  console.log('\nGotowe. Odśwież stronę zareczyny.epirbizuteria.pl');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
