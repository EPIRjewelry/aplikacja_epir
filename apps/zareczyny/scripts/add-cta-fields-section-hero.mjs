#!/usr/bin/env node
/**
 * Dodaje pola cta_href, cta_text, cta_target do definicji section_hero przez Admin API.
 * Wymaga: SHOPIFY_ADMIN_ACCESS_TOKEN (Custom App z scope write_metaobject_definitions)
 * Źródła tokenu: zmienna środowiskowa lub .dev.vars (SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx)
 * Uruchom: node scripts/add-cta-fields-section-hero.mjs
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
const DEFINITION_ID = 'gid://shopify/MetaobjectDefinition/34415870284';
const API_VERSION = '2024-01';

const mutation = `mutation AddCtaFields($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
  metaobjectDefinitionUpdate(id: $id, definition: $definition) {
    metaobjectDefinition {
      id
      name
      fieldDefinitions { name key }
    }
    userErrors { field message code }
  }
}`;

const variables = {
  id: DEFINITION_ID,
  definition: {
    fieldDefinitions: [
      { create: { key: 'cta_href', name: 'CTA href', type: 'single_line_text_field' } },
      { create: { key: 'cta_text', name: 'CTA text', type: 'single_line_text_field' } },
      { create: { key: 'cta_target', name: 'CTA target', type: 'single_line_text_field' } },
    ],
  },
};

async function main() {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) {
    console.error('Brak SHOPIFY_ADMIN_ACCESS_TOKEN. Ustaw zmienną środowiskową:');
    console.error('  Windows: set SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx');
    console.error('  Unix:    export SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx');
    console.error('\nToken: Shopify Admin → Settings → Apps → Develop apps → Create app → Configure Admin API → write_metaobject_definitions');
    process.exit(1);
  }

  const url = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const json = await res.json();
  const data = json?.data?.metaobjectDefinitionUpdate;
  const errors = json?.errors || data?.userErrors || [];

  if (errors.length > 0) {
    console.error('Błędy:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  console.log('Sukces. Pola dodane do section_hero:', data?.metaobjectDefinition?.fieldDefinitions?.map((f) => f.key).join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
