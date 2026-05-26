#!/usr/bin/env node
/**
 * Dodaje pola cta_href, cta_text, cta_target do definicji section_hero przez Admin API.
 * Wymaga: SHOPIFY_ADMIN_ACCESS_TOKEN (Custom App z scope write_metaobject_definitions)
 *
 * Uruchom z root repo:
 *   node scripts/add-cta-fields-section-hero.mjs --app=kazka
 *   node scripts/add-cta-fields-section-hero.mjs --app=zareczyny
 */

import {readFileSync, existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPS = new Set(['kazka', 'zareczyny']);

function parseAppArg() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--app=')) {
      const app = arg.slice('--app='.length).trim();
      if (APPS.has(app)) return app;
      console.error(`Nieznana aplikacja: ${app}. Dozwolone: kazka, zareczyny`);
      process.exit(1);
    }
  }
  console.error('Podaj --app=kazka lub --app=zareczyny');
  process.exit(1);
}

function loadFromDevVars(app) {
  const paths = [
    join(REPO_ROOT, 'apps', app, '.dev.vars'),
    join(REPO_ROOT, '.dev.vars'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      const m = content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

const app = parseAppArg();

if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
  const token = loadFromDevVars(app);
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
      {create: {key: 'cta_href', name: 'CTA href', type: 'single_line_text_field'}},
      {create: {key: 'cta_text', name: 'CTA text', type: 'single_line_text_field'}},
      {create: {key: 'cta_target', name: 'CTA target', type: 'single_line_text_field'}},
    ],
  },
};

async function main() {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) {
    console.error(`Brak SHOPIFY_ADMIN_ACCESS_TOKEN (app=${app}). Ustaw zmienną lub apps/${app}/.dev.vars`);
    process.exit(1);
  }

  const url = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({query: mutation, variables}),
  });

  const json = await res.json();
  const data = json?.data?.metaobjectDefinitionUpdate;
  const errors = json?.errors || data?.userErrors || [];

  if (errors.length > 0) {
    console.error('Błędy:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  console.log(
    `[${app}] Sukces. Pola section_hero:`,
    data?.metaobjectDefinition?.fieldDefinitions?.map((f) => f.key).join(', '),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
