#!/usr/bin/env node
/**
 * Tworzy dwa wpisy metaobject: kazka_ai_profile i zareczyny_ai_profile
 * Wymaga: SHOPIFY_ADMIN_ACCESS_TOKEN oraz SHOP (np. epir-art-silver-jewellery.myshopify.com)
 * Uruchom: node scripts/create-ai-profiles.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const paths = [
    join(dir, '../.dev.vars'),
    join(dir, './.dev.vars'),
    join(dir, '../apps/kazka/.dev.vars'),
    join(dir, '../apps/zareczyny/.dev.vars'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      const mToken = content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/);
      const mShop = content.match(/SHOP\s*=\s*(.+)/);
      const token = mToken ? mToken[1].trim().replace(/^['"]|['"]$/g, '') : null;
      const shop = mShop ? mShop[1].trim().replace(/^['"]|['"]$/g, '') : null;
      return { token, shop };
    }
  }
  return { token: null, shop: null };
}

if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || !process.env.SHOP) {
  const fromDev = loadFromDevVars();
  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && fromDev.token) process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = fromDev.token;
  if (!process.env.SHOP && fromDev.shop) process.env.SHOP = fromDev.shop;
}

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = '2024-01';

if (!SHOP || !TOKEN) {
  console.error('Brakuje wymaganych zmiennych. Ustaw SHOP i SHOPIFY_ADMIN_ACCESS_TOKEN.');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

const mutation = `mutation CreateMetaobject($input: MetaobjectInput!) {
  metaobjectCreate(input: $input) {
    metaobject { id type handle }
    userErrors { field message }
  }
}`;

/** Pola UI — wymagają wpisów w definicji metaobject (single_line_text); najpierw: node scripts/migrate-ai-profile-ui-fields.mjs */
const profiles = [
  {
    type: 'kazka_ai_profile',
    fields: [
      { key: 'brand_voice', value: 'Warm, knowledgeable, spa-like luxury. Editorial tone with approachable expertise.' },
      { key: 'core_values', value: 'Craftsmanship, natural beauty, storytelling through gemstones, sustainable luxury, personal connection.' },
      { key: 'faq_theme', value: 'Gemstone education, custom jewelry process, shipping & care' },
      { key: 'promotion_rules', value: 'Free shipping over 500 PLN. Gift wrapping available. Custom orders require 2-3 week lead time.' },
      { key: 'assistant_display_name', value: 'Gemma' },
      { key: 'chat_title', value: 'Czat z Gemmą' },
      { key: 'empty_state_headline', value: 'Napisz wiadomość' },
      { key: 'empty_state_body', value: 'aby rozpocząć rozmowę z doradczynią.' },
    ],
  },
  {
    type: 'zareczyny_ai_profile',
    fields: [
      { key: 'brand_voice', value: 'Warm, knowledgeable, spa-like luxury. Editorial tone with approachable expertise.' },
      { key: 'core_values', value: 'Craftsmanship, natural beauty, storytelling through gemstones, sustainable luxury, personal connection.' },
      { key: 'faq_theme', value: 'Gemstone education, custom jewelry process, shipping & care' },
      { key: 'promotion_rules', value: 'Free shipping over 500 PLN. Gift wrapping available. Custom orders require 2-3 week lead time.' },
      { key: 'assistant_display_name', value: 'Gemma' },
      { key: 'chat_title', value: 'Czat z Gemmą' },
      { key: 'empty_state_headline', value: 'Napisz wiadomość' },
      { key: 'empty_state_body', value: 'aby rozpocząć rozmowę z doradczynią.' },
    ],
  },
];

async function createProfile(p) {
  const input = {
    type: p.type,
    fields: p.fields.map((f) => ({ key: f.key, value: f.value })),
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query: mutation, variables: { input } }),
  });

  const json = await res.json();
  const data = json?.data?.metaobjectCreate;
  const errors = json?.errors || data?.userErrors || [];
  if (errors.length > 0) {
    console.error('Błędy przy tworzeniu', p.type, JSON.stringify(errors, null, 2));
    return null;
  }
  const id = data?.metaobject?.id;
  console.log(`Utworzono ${p.type} -> GID: ${id}`);
  return id;
}

async function main() {
  console.log('Tworzenie metaobject entries dla kazka i zareczyny...');
  for (const p of profiles) {
    try {
      await createProfile(p);
    } catch (e) {
      console.error('Błąd:', e);
    }
  }
  console.log('\nGotowe. Skopiuj GIDy z powyższego outputu i wklej do mapowania Workerów.');
}

main();
