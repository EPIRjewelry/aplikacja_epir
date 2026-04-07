#!/usr/bin/env node
/**
 * Migracja schematu definicji typu **ai_profile** (w Admin jest jedna definicja; wpisy kazka/zareczyny różnią się handle / storefront_id):
 * - dodaje pola UI: assistant_display_name, chat_title, empty_state_headline, empty_state_body
 * - upsert wartości na istniejących wpisach (GID z mapowania workerów)
 *
 * Wymaga: SHOPIFY_ADMIN_ACCESS_TOKEN — token **Admin API** Custom App (shpat_…), scope m.in.
 *   read_metaobjects, write_metaobjects, read_metaobject_definitions, write_metaobject_definitions.
 *   Nie używaj samego PRIVATE_STOREFRONT_API_TOKEN (Storefront) — `shop{}` zadziała, metaobiekty będą puste/null.
 *   SHOP lub PUBLIC_STORE_DOMAIN / SHOPIFY_SHOP_DOMAIN
 * Uruchom: node scripts/migrate-ai-profile-ui-fields.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';

const NEW_FIELD_DEFS = [
  { name: 'Assistant display name', key: 'assistant_display_name', type: 'single_line_text_field' },
  { name: 'Chat title', key: 'chat_title', type: 'single_line_text_field' },
  { name: 'Empty state headline', key: 'empty_state_headline', type: 'single_line_text_field' },
  { name: 'Empty state body', key: 'empty_state_body', type: 'single_line_text_field' },
];

/** Wartości biznesowe zgodne z personą Gemma (nadpisują DEFAULT_PERSONA_UI po stronie danych) */
const SEED_UI_BY_META_GID = {
  'gid://shopify/Metaobject/2057969205580': {
    assistant_display_name: 'Gemma',
    chat_title: 'Czat z Gemmą',
    empty_state_headline: 'Napisz wiadomość',
    empty_state_body: 'aby rozpocząć rozmowę z doradczynią.',
  },
  'gid://shopify/Metaobject/2117458166092': {
    assistant_display_name: 'Gemma',
    chat_title: 'Czat z Gemmą',
    empty_state_headline: 'Napisz wiadomość',
    empty_state_body: 'aby rozpocząć rozmowę z doradczynią.',
  },
};

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

/** Host sklepu bez protokołu (np. z PUBLIC_STORE_DOMAIN) */
function normalizeShopHost(raw) {
  let s = trimVal(raw);
  s = s.replace(/^https?:\/\//i, '').split('/')[0];
  return s;
}

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
      const mShopAlt = content.match(/(?:PUBLIC_STORE_DOMAIN|SHOPIFY_SHOP_DOMAIN)\s*=\s*(.+)/);
      const token = mToken ? trimVal(mToken[1]) : null;
      const shop = mShop ? trimVal(mShop[1]) : mShopAlt ? normalizeShopHost(mShopAlt[1]) : null;
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
if (!process.env.SHOP && process.env.SHOPIFY_SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOPIFY_SHOP_DOMAIN);
}
if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && process.env.SHOPIFY_ADMIN_TOKEN) {
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
}

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

if (!SHOP || !TOKEN) {
  console.error('Brakuje SHOP lub SHOPIFY_ADMIN_ACCESS_TOKEN (lub .dev.vars).');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText} — endpoint: ${endpoint}`);
  }
  if (json.errors?.length) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
  }
  return json;
}

/** Merchant-owned lub app-owned (`$app:…`, `…:kazka_ai_profile`) */
function matchesMetaobjectDefType(type, base) {
  if (!type || !base) return false;
  if (type === base) return true;
  if (type === `$app:${base}`) return true;
  if (type.endsWith(`:${base}`)) return true;
  return false;
}

const QUERY_DEFINITIONS = `#graphql
  query MetaobjectDefinitionsForMigration {
    metaobjectDefinitions(first: 100) {
      edges {
        node {
          id
          type
          fieldDefinitions {
            key
            name
          }
        }
      }
    }
  }
`;

const MUT_DEFINITION_UPDATE = `#graphql
  mutation MetaobjectDefinitionAddUiFields($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition {
        id
        type
        fieldDefinitions {
          key
          name
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const MUT_METAOBJECT_UPDATE = `#graphql
  mutation MetaobjectSeedUi($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
        handle
        fields {
          key
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

function buildFieldCreates(existingKeys) {
  return NEW_FIELD_DEFS.filter((f) => !existingKeys.has(f.key)).map((f) => ({
    create: {
      name: f.name,
      key: f.key,
      type: f.type,
    },
  }));
}

async function migrateDefinition(defNode) {
  const existingKeys = new Set((defNode.fieldDefinitions ?? []).map((fd) => fd.key).filter(Boolean));
  const creates = buildFieldCreates(existingKeys);
  if (creates.length === 0) {
    console.log(`[${defNode.type}] Definicja już zawiera pola UI — pomijam tworzenie.`);
    return { ok: true, skipped: true };
  }
  const json = await gql(MUT_DEFINITION_UPDATE, {
    id: defNode.id,
    definition: {
      fieldDefinitions: creates,
    },
  });
  const err = json?.data?.metaobjectDefinitionUpdate?.userErrors;
  if (err?.length) {
    console.error(`[${defNode.type}] userErrors (definition):`, JSON.stringify(err, null, 2));
    return { ok: false };
  }
  const def = json?.data?.metaobjectDefinitionUpdate?.metaobjectDefinition;
  console.log(`[${defNode.type}] Zaktualizowano definicję. Pola:`, def?.fieldDefinitions?.map((f) => f.key).join(', '));
  return { ok: true };
}

async function seedMetaobject(gid) {
  const values = SEED_UI_BY_META_GID[gid];
  if (!values) {
    console.warn(`Brak mapowania seed dla ${gid} — pomijam upsert.`);
    return { ok: true, skipped: true };
  }
  const fields = Object.entries(values).map(([key, value]) => ({ key, value }));
  const json = await gql(MUT_METAOBJECT_UPDATE, {
    id: gid,
    metaobject: { fields },
  });
  const err = json?.data?.metaobjectUpdate?.userErrors;
  if (err?.length) {
    console.error(`[${gid}] userErrors (metaobject):`, JSON.stringify(err, null, 2));
    return { ok: false };
  }
  const mo = json?.data?.metaobjectUpdate?.metaobject;
  console.log(`[${gid}] Zapisano pola UI. Handle: ${mo?.handle ?? '—'}`);
  const saved = Object.fromEntries((mo?.fields ?? []).filter((f) => values[f.key] != null).map((f) => [f.key, f.value]));
  console.log('  Potwierdzone wartości:', JSON.stringify(saved, null, 2));
  return { ok: true };
}

async function main() {
  console.log('=== Migracja pól UI: definicja ai_profile + wpisy kazka / zareczyny (GID) ===\n');

  const qjson = await gql(QUERY_DEFINITIONS);
  if (qjson?.errors?.length && !qjson?.data) {
    console.error('Zapytanie definicji nie zwróciło data — sprawdź token Admin API i scope (read_metaobject_definitions).');
    process.exit(1);
  }
  const raw = qjson?.data?.metaobjectDefinitions;
  const nodes =
    raw?.nodes ?? raw?.edges?.map((e) => e?.node).filter(Boolean) ?? [];
  const targets = nodes.filter((n) => matchesMetaobjectDefType(n.type, 'ai_profile'));

  if (targets.length === 0) {
    const sampleTypes = nodes.map((n) => n.type).filter(Boolean);
    console.error('Nie znaleziono definicji typu ai_profile. Sprawdź sklep.');
    console.error(`Znalezione typy (do ${sampleTypes.length} definicji, pierwsze 40):`, sampleTypes.slice(0, 40));
    process.exit(1);
  }

  let allOk = true;
  for (const def of targets) {
    const r = await migrateDefinition(def);
    if (!r.ok) allOk = false;
  }

  console.log('\n--- Upsert wpisów (GID) ---\n');
  for (const gid of Object.keys(SEED_UI_BY_META_GID)) {
    const r = await seedMetaobject(gid);
    if (!r.ok) allOk = false;
  }

  if (!allOk) {
    console.error('\nMigracja zakończona z błędami.');
    process.exit(1);
  }
  console.log('\n=== Gotowe. Shopify API potwierdziło zapis definicji i wartości (brak userErrors). ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
