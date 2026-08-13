#!/usr/bin/env node
/**
 * Seed campaign landing metaobjects + shop.metafields.app.campaign_mapping.
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN lub SHOPIFY_ADMIN_ACCESS_TOKEN
 *   SHOP lub PUBLIC_STORE_DOMAIN / SHOPIFY_SHOP_DOMAIN
 *
 * Po `shopify app deploy` i reinstalacji app (scope read_metaobjects, write_metaobjects):
 *   node scripts/seed-campaign-landings.mjs
 *
 * Opcje:
 *   --apex-only      tor Apex (epirbizuteria.pl): merge kluczy Ads, upsert landingów
 *                    Apex; nie nadpisuje kluczy kazka_* ani istniejących landingów Kazka
 *   --migrate-organic-art  rename wiecznosc_art→organic_art, handle landingu,
 *                    product_ids z kolekcji kolekcja-galazki (EPIR, bez Kazka/sprzedane)
 *   --skip-invalid   pomiń brakujące product GID zamiast failować
 *   --product-limit=N  ile produktów Kazka pobrać do product_ids (domyślnie 8; ignorowane w --apex-only)
 *
 * product_ids: jeśli SEED_LANDINGS ma puste tablice, skrypt auto-pobiera GID-y
 * produktów z kolekcji/tagu kazka przez Admin API (tryb domyślny / Kazka).
 * W --apex-only: CURATED_HANDLES (handle Shopify) → resolve GID; fallback collection/query.
 */

import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const CAMPAIGN_LANDING_TYPE = '$app:campaign_landing';

const argv = process.argv.slice(2);
const APEX_ONLY = argv.includes('--apex-only');
const MIGRATE_ORGANIC_ART = argv.includes('--migrate-organic-art');
const SKIP_INVALID = argv.includes('--skip-invalid');
const productLimitArg = argv.find((a) => a.startsWith('--product-limit='));
const PRODUCT_LIMIT = productLimitArg
  ? Math.max(1, Number(productLimitArg.split('=')[1]) || 8)
  : 8;

/** Tor Kazka (Hydrogen) — pełny overwrite tylko bez --apex-only. */
const SEED_MAPPING = {
  kazka_b2b: 'b2b-landing',
  kazka_wiecznosc: 'wiecznosc-landing',
  kazka_lab_grown: 'lab-grown-landing',
  default: 'default-landing',
};

/** Tor Apex (Liquid + HTMLRewriter) — merge do istniejącego mappingu. */
const APEX_MAPPING_REMOVED_KEYS = ['wiecznosc_art', 'artisan_new'];
const APEX_MAPPING = {
  organic_art: 'organic-art-landing',
  artisan_rings: 'artisan-rings-landing',
  forest_premium: 'forest-premium-landing',
  artisan_gold: 'artisan-gold-landing',
};

const ORGANIC_ART_METAOBJECT_GID = 'gid://shopify/Metaobject/3041383743820';
const ORGANIC_ART_COLLECTION_HANDLE = 'kolekcja-galazki';
const ORGANIC_ART_PRODUCT_LIMIT = 8;

/**
 * Kurowane bestsellery (handle Shopify) — źródło prawdy przed collection/query fallback.
 * Operator: edytuj listę i uruchom `node scripts/seed-campaign-landings.mjs --apex-only`.
 */
const CURATED_HANDLES = {
  'forest-premium-landing': [
    'pierscionek-galazki-z-czarnym-turmalinem',
    'nowe-galazki-rafa-koralowa-z-czarnym-turmalinem',
    'pierscionek-srebrny-z-topazem-1',
    'pierscionek-pozlacany-galazki-z-topazem-sky-blue',
    'kolczyki-z-czarnymi-perlami',
    'pierscionek-srebrny-z-ametystem-kora-drzewa',
    'obraczka-srebrna-z-granatem-kora-drzewa',
    'pierscionek-srebrny-fale-wody-z-szafirem',
  ],
  'organic-art-landing': [
    'pierscionek-galazki-z-czarnym-turmalinem',
    'pierscionek-pozlacany-z-owalnym-granatem-galazka',
    'pierscionek-srebrny-z-topazem-london-blue',
    'kolczyki-galazki-z-topazami-london-blue',
    'pierscionek-srebrny-z-duzym-szmaragdem-z-kolekcji-galazki',
    'pierscionek-srebrny-z-ametystem-z-kolekcji-galazki',
    'pozlacany-zloty-pierscionek-galazka-z-granatem',
    'srebrny-pierscionek-z-granatem',
  ],
  'artisan-rings-landing': [
    'pierscionek-galazki-z-czarnym-turmalinem',
    'nowe-galazki-rafa-koralowa-z-czarnym-turmalinem',
    'pierscionek-galazki-z-granatem',
    'pierscionek-srebrny-galazki-z-czarnym-opalem',
    'pierscionek-galazki-z-topazem-swiss-blue',
    'pierscionek-glazki-z-ametystem',
    'pierscionek-srebrny-z-topazem-london-blue',
    'pierscionek-srebrny-fale-wody-z-szafirem',
  ],
  'artisan-new-landing': [
    'pierscionek-zloty-galazki-z-kwarcem-turmalinowym',
    'pierscionek-srebrny-z-topazem-london-blue',
    'kolczyki-galazki-z-topazami-london-blue',
    'obraczki-zlote-mlotkowane-1',
    'pierscionek-z-bialego-zlota-sploty-galezi-z-rubinem',
    'pierscionek-srebrny-fale-wody-z-szafirem',
    'pierscionek-srebrny-z-topazem-sky-blue',
    'pierscionek-pozlacany-z-ametystem',
  ],
  'artisan-gold-landing': [
    'zloty-pierscionek-z-naturalnym-szafirem',
    'pierscionek-zloty-galazki-z-kwarcem-turmalinowym',
    'zlota-obraczka-galazka',
    'kolczyki-zlote-z-tanzanitami',
    'zloty-pierscionek-z-ametystem-epir',
    'zloty-pierscionek-galazka-z-topazem-swiss-blue',
    'zloty-pierscionek-z-moissanitem-z-kolekcji-galazki',
    'pierscionek-z-bialego-zlota-sploty-galezi-z-rubinem',
  ],
};

/** productIds: [] → auto-fill z katalogu Kazka (patrz fetchKazkaProductGids). */
const SEED_LANDINGS = [
  {
    handle: 'default-landing',
    heroTitle: 'EPIR Art Jewellery — Kazka',
    heroSubtitle:
      'Biżuteria tworzona w polskiej pracowni — diamenty selekcjonowane przez gemmologów.',
    productIds: [],
    ctaLabel: 'Zobacz kolekcję',
    ctaUrl: '/collections/kazka',
  },
  {
    handle: 'b2b-landing',
    heroTitle: 'KAZKA dla partnerów B2B',
    heroSubtitle: 'Ekskluzywna oferta hurtowa i współpraca z salonami jubilerskimi.',
    productIds: [],
    ctaLabel: 'Skontaktuj się',
    ctaUrl: '/pages/o-nas',
  },
  {
    handle: 'wiecznosc-landing',
    heroTitle: 'Kolekcja Wieczność',
    heroSubtitle: 'Symbolika wieczności w formie biżuterii artystycznej.',
    productIds: [],
    ctaLabel: 'Odkryj kolekcję',
    ctaUrl: '/collections/kazka',
  },
  {
    handle: 'lab-grown-landing',
    heroTitle: 'Diamenty laboratoryjne',
    heroSubtitle: 'Nowoczesna elegancja — diamenty lab-grown w polskiej pracowni.',
    productIds: [],
    ctaLabel: 'Zobacz produkty',
    ctaUrl: '/collections/kazka',
  },
];

/**
 * Tor Apex — osobne handlere od Kazki (nie współdzielą metaobiektów).
 * productIds puste → uzupełnić ręcznie przed startem Ads.
 */
const APEX_LANDINGS = [
  {
    handle: 'organic-art-landing',
    skipIfExists: false,
    collectionHandle: 'kolekcja-galazki',
    heroTitle: 'Biżuteria artystyczna',
    heroSubtitle:
      'Ręcznie tworzona biżuteria z polskiej pracowni — forma, materiał, symbolika wieczności.',
    productIds: [],
    ctaLabel: 'Odkryj kolekcję',
    ctaUrl: '/collections/kolekcja-galazki',
  },
  {
    handle: 'artisan-rings-landing',
    skipIfExists: false,
    productQuery: 'product_type:Pierścionek -vendor:Kazka -tag:sprzedane status:active',
    heroTitle: 'Pierścionki artystyczne',
    heroSubtitle:
      'Srebrne pierścionki z polskiej pracowni — unikalne formy i kamienie naturalne.',
    productIds: [],
    ctaLabel: 'Zobacz pierścionki',
    ctaUrl: '/collections/pierscionki-obraczki',
  },
  {
    handle: 'artisan-new-landing',
    skipIfExists: false,
    collectionHandle: 'nowosci-1',
    heroTitle: 'Nowości w pracowni',
    heroSubtitle:
      'Świeże projekty EPIR — biżuteria artystyczna dopiero opuszczająca warsztat.',
    productIds: [],
    ctaLabel: 'Zobacz nowości',
    ctaUrl: '/collections/nowosci-1',
  },
  {
    handle: 'forest-premium-landing',
    skipIfExists: false,
    collectionHandle: 'bestsellery',
    heroTitle: 'Rzemiosło premium',
    heroSubtitle:
      'Ekskluzywna biżuteria artystyczna — ciemny las, forma i praca rąk.',
    productIds: [],
    ctaLabel: 'Zobacz kolekcję',
    ctaUrl: '/collections/bestsellery',
  },
  {
    handle: 'artisan-gold-landing',
    skipIfExists: false,
    productQuery:
      '(title:złot* OR title:zlot* OR tag:złoto OR tag:zloto) -vendor:Kazka -tag:sprzedane status:active',
    heroTitle: 'Biżuteria ze złota',
    heroSubtitle:
      'Złoto formowane jak gałąź — ciepły metal, ręczny odlew i wykończenie we wrocławskiej pracowni.',
    productIds: [],
    ctaLabel: 'Zobacz złoto',
    ctaUrl: '/collections/zlota-bizuteria',
  },
];

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
  const paths = [
    join(dir, '../.dev.vars'),
    join(dir, '../apps/kazka/.dev.vars'),
    join(dir, '../workers/chat/.dev.vars'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop = content.match(/SHOP\s*=\s*(.+)/);
    const mShopAlt = content.match(
      /(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN|PUBLIC_STORE_DOMAIN)\s*=\s*(.+)/,
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

if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || !process.env.SHOP) {
  const fromDev = loadFromDevVars();
  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && fromDev.token) {
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = fromDev.token;
  }
  if (!process.env.SHOP && fromDev.shop) {
    process.env.SHOP = fromDev.shop;
  }
}
if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && process.env.SHOPIFY_ADMIN_TOKEN) {
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
}
if (!process.env.SHOP && process.env.SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOP_DOMAIN);
}
if (!process.env.SHOP && process.env.PUBLIC_STORE_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.PUBLIC_STORE_DOMAIN);
}

const SHOP = process.env.SHOP || DEFAULT_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

if (!TOKEN) {
  console.error(
    'Brak SHOPIFY_ADMIN_TOKEN / SHOPIFY_ADMIN_ACCESS_TOKEN (lub .dev.vars).',
  );
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
    body: JSON.stringify({query, variables}),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

const SHOP_ID_QUERY = `#graphql
  query {
    shop {
      id
      campaignMapping: metafield(namespace: "app", key: "campaign_mapping") {
        value
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        namespace
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAOBJECT_UPSERT = `#graphql
  mutation metaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAOBJECT_UPDATE = `#graphql
  mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const COLLECTION_PRODUCTS_QUERY = `#graphql
  query CollectionProductsForApex($query: String!, $first: Int!) {
    collections(first: 1, query: $query) {
      nodes {
        id
        handle
        products(first: $first) {
          nodes {
            id
            title
            vendor
            tags
            status
          }
        }
      }
    }
  }
`;

function parseMappingJson(raw) {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

const PRODUCTS_BY_IDS = `#graphql
  query ValidateProductIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
      }
    }
  }
`;

const PRODUCTS_BY_HANDLES = `#graphql
  query ProductsByHandles($q: String!, $first: Int!) {
    products(first: $first, query: $q) {
      nodes {
        id
        handle
        title
        status
        vendor
        tags
      }
    }
  }
`;

const KAZKA_PRODUCTS_QUERY = `#graphql
  query KazkaProductsForCampaignSeed($first: Int!, $query: String!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        handle
        status
        vendor
        tags
      }
    }
  }
`;

function isProductGid(id) {
  return typeof id === 'string' && id.startsWith('gid://shopify/Product/');
}

async function validateProductGids(productIds) {
  const unique = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return {valid: [], missing: []};

  const malformed = unique.filter((id) => !isProductGid(id));
  const gids = unique.filter(isProductGid);
  if (!gids.length) return {valid: [], missing: malformed};

  const data = await gql(PRODUCTS_BY_IDS, {ids: gids});
  const found = new Set(
    (data.nodes ?? []).filter((n) => n?.id).map((n) => n.id),
  );
  return {
    valid: gids.filter((id) => found.has(id)),
    missing: [...malformed, ...gids.filter((id) => !found.has(id))],
  };
}

async function fetchKazkaProductGids(limit) {
  // Prefer products tagged/in collection kazka; fallback active products.
  const queries = [
    'collection:kazka status:active',
    'tag:kazka status:active',
    'status:active',
  ];
  for (const query of queries) {
    const data = await gql(KAZKA_PRODUCTS_QUERY, {first: limit, query});
    const nodes = (data.products?.nodes ?? []).filter((n) => n?.id);
    if (nodes.length) {
      console.log(
        `[seed-campaign-landings] auto product_ids from query="${query}" count=${nodes.length}`,
      );
      return nodes.map((n) => n.id);
    }
  }
  console.warn('[seed-campaign-landings] no products found for auto product_ids');
  return [];
}

function landingFields(landing) {
  // Handle metaobiektu to systemowy handle upsertu — nie pole (zarezerwowane w Shopify).
  const fields = [{key: 'hero_title', value: landing.heroTitle}];
  if (landing.heroSubtitle) {
    fields.push({key: 'hero_subtitle', value: landing.heroSubtitle});
  }
  if (landing.productIds?.length) {
    fields.push({key: 'product_ids', value: JSON.stringify(landing.productIds)});
  }
  if (landing.ctaLabel) {
    fields.push({key: 'cta_label', value: landing.ctaLabel});
  }
  if (landing.ctaUrl) {
    fields.push({key: 'cta_url', value: landing.ctaUrl});
  }
  return fields;
}

async function resolveProductIds(landing, autoGids) {
  const raw =
    landing.productIds?.length > 0 ? landing.productIds : autoGids;
  if (!raw.length) return [];

  const {valid, missing} = await validateProductGids(raw);
  if (missing.length) {
    const msg = `product_ids not found for ${landing.handle}: ${missing.join(', ')}`;
    if (!SKIP_INVALID) {
      throw new Error(`${msg} (użyj --skip-invalid aby kontynuować)`);
    }
    console.warn(`[seed-campaign-landings] --skip-invalid: ${msg}`);
  }
  return valid;
}

function applyApexMappingPatch(existingMapping) {
  const merged = {...existingMapping};
  for (const key of APEX_MAPPING_REMOVED_KEYS) {
    delete merged[key];
  }
  return {...merged, ...APEX_MAPPING};
}

async function fetchEpirProductGidsByHandles(
  handles,
  {excludeVendor = 'Kazka', excludeTag = 'sprzedane'} = {},
) {
  const list = [...new Set((handles || []).map((h) => String(h).trim()).filter(Boolean))];
  if (!list.length) return [];

  const vendorNeedle = excludeVendor.trim().toLowerCase();
  const byHandle = new Map();
  // Shopify product search by handle: — batch in chunks of 8.
  for (let i = 0; i < list.length; i += 8) {
    const chunk = list.slice(i, i + 8);
    const q = chunk.map((h) => `handle:${h}`).join(' OR ');
    const data = await gql(PRODUCTS_BY_HANDLES, {q, first: 50});
    for (const node of data.products?.nodes ?? []) {
      if (!node?.id || node.status !== 'ACTIVE') continue;
      const vendor = (node.vendor ?? '').trim().toLowerCase();
      if (vendorNeedle && vendor === vendorNeedle) continue;
      const tags = (node.tags ?? []).map((t) => String(t).toLowerCase());
      if (excludeTag && tags.includes(excludeTag.toLowerCase())) continue;
      if (node.handle) byHandle.set(node.handle, node);
    }
  }

  const ordered = [];
  const missing = [];
  for (const h of list) {
    const node = byHandle.get(h);
    if (node) ordered.push(node);
    else missing.push(h);
  }
  if (missing.length) {
    console.warn(
      `[seed-campaign-landings] curated handles missing: ${missing.join(', ')}`,
    );
  }
  console.log(
    `[seed-campaign-landings] curated handles resolved=${ordered.length}/${list.length}`,
  );
  for (const node of ordered) {
    console.log(`  - ${node.title} (${node.handle})`);
  }
  return ordered.map((n) => n.id);
}

async function fetchEpirCollectionProductGids(
  collectionHandle,
  {limit = 8, excludeVendor = 'Kazka', excludeTag = 'sprzedane'} = {},
) {
  const data = await gql(COLLECTION_PRODUCTS_QUERY, {
    query: `handle:${collectionHandle}`,
    first: 50,
  });
  const nodes = data.collections?.nodes?.[0]?.products?.nodes ?? [];
  const vendorNeedle = excludeVendor.trim().toLowerCase();
  const filtered = nodes.filter((node) => {
    if (!node?.id || node.status !== 'ACTIVE') return false;
    const vendor = (node.vendor ?? '').trim().toLowerCase();
    if (vendorNeedle && vendor === vendorNeedle) return false;
    const tags = (node.tags ?? []).map((t) => String(t).toLowerCase());
    if (excludeTag && tags.includes(excludeTag.toLowerCase())) return false;
    return true;
  });
  const picked = filtered.slice(0, limit).map((n) => n.id);
  console.log(
    `[seed-campaign-landings] collection=${collectionHandle} products=${picked.length} (excl vendor=${excludeVendor}, tag=${excludeTag})`,
  );
  for (const node of filtered.slice(0, limit)) {
    console.log(`  - ${node.title} (${node.id})`);
  }
  return picked;
}

async function fetchEpirProductGidsByQuery(
  query,
  {limit = 8, excludeVendor = 'Kazka', excludeTag = 'sprzedane'} = {},
) {
  const data = await gql(KAZKA_PRODUCTS_QUERY, {first: 50, query});
  const nodes = data.products?.nodes ?? [];
  const vendorNeedle = excludeVendor.trim().toLowerCase();
  const filtered = nodes.filter((node) => {
    if (!node?.id || node.status !== 'ACTIVE') return false;
    const vendor = (node.vendor ?? '').trim().toLowerCase();
    if (vendorNeedle && vendor === vendorNeedle) return false;
    const tags = (node.tags ?? []).map((t) => String(t).toLowerCase());
    if (excludeTag && tags.includes(excludeTag.toLowerCase())) return false;
    return true;
  });
  const picked = filtered.slice(0, limit).map((n) => n.id);
  console.log(
    `[seed-campaign-landings] query="${query}" products=${picked.length} (excl vendor=${excludeVendor}, tag=${excludeTag})`,
  );
  for (const node of filtered.slice(0, limit)) {
    console.log(`  - ${node.title} (${node.id})`);
  }
  return picked;
}

async function updateMetaobjectById(id, {handle, fields}) {
  const metaobject = {redirectNewHandle: true};
  if (handle) metaobject.handle = handle;
  if (fields?.length) metaobject.fields = fields;

  const result = await gql(METAOBJECT_UPDATE, {id, metaobject});
  const errors = result.metaobjectUpdate?.userErrors ?? [];
  if (errors.length) {
    throw new Error(`metaobjectUpdate ${id}: ${JSON.stringify(errors)}`);
  }
  return result.metaobjectUpdate?.metaobject;
}

const METAOBJECT_BY_HANDLE = `#graphql
  query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
    }
  }
`;

async function migrateOrganicArt(shopId, existingMapping) {
  const productIds = await fetchEpirCollectionProductGids(
    ORGANIC_ART_COLLECTION_HANDLE,
    {limit: ORGANIC_ART_PRODUCT_LIMIT},
  );
  const {valid: validProductIds} = await validateProductGids(productIds);

  const organicLanding = APEX_LANDINGS.find(
    (l) => l.handle === 'organic-art-landing',
  );
  if (!organicLanding) {
    throw new Error('organic-art-landing definition missing');
  }

  const fields = landingFields({
    ...organicLanding,
    productIds: validProductIds,
  });

  const meta = await updateMetaobjectById(ORGANIC_ART_METAOBJECT_GID, {
    handle: 'organic-art-landing',
    fields,
  });
  console.log(
    `[seed-campaign-landings] metaobject rename/update → ${meta?.handle} (${meta?.id}) products=${validProductIds.length}`,
  );

  const merged = applyApexMappingPatch(existingMapping);
  await setCampaignMapping(shopId, merged);
  console.log('[seed-campaign-landings] campaign_mapping (after organic_art)', merged);
  return merged;
}

async function setCampaignMapping(shopId, mapping) {
  const mappingResult = await gql(METAFIELDS_SET, {
    metafields: [
      {
        ownerId: shopId,
        namespace: 'app',
        key: 'campaign_mapping',
        type: 'json',
        value: JSON.stringify(mapping),
      },
    ],
  });
  const mappingErrors = mappingResult.metafieldsSet?.userErrors ?? [];
  if (mappingErrors.length) {
    throw new Error(`metafieldsSet: ${JSON.stringify(mappingErrors)}`);
  }
  return mapping;
}

async function upsertLanding(landing, productIds) {
  const result = await gql(METAOBJECT_UPSERT, {
    handle: {type: CAMPAIGN_LANDING_TYPE, handle: landing.handle},
    metaobject: {fields: landingFields({...landing, productIds})},
  });
  const errors = result.metaobjectUpsert?.userErrors ?? [];
  if (errors.length) {
    throw new Error(
      `metaobjectUpsert ${landing.handle}: ${JSON.stringify(errors)}`,
    );
  }
  return result.metaobjectUpsert?.metaobject;
}

async function metaobjectExists(handle) {
  const data = await gql(METAOBJECT_BY_HANDLE, {
    handle: {type: CAMPAIGN_LANDING_TYPE, handle},
  });
  return Boolean(data?.metaobjectByHandle?.id);
}

async function seedApexOnly(shopId, existingMapping) {
  const merged = applyApexMappingPatch(existingMapping);
  await setCampaignMapping(shopId, merged);
  console.log('[seed-campaign-landings] campaign_mapping (merged Apex)', merged);

  for (const landing of APEX_LANDINGS) {
    if (landing.skipIfExists) {
      const exists = await metaobjectExists(landing.handle);
      if (exists) {
        console.log(
          `[seed-campaign-landings] skip ${landing.handle} (już istnieje — tor Kazka nienaruszony)`,
        );
        continue;
      }
    }

    // Apex: 1) CURATED_HANDLES 2) collection/query fallback (EPIR, bez Kazka/sprzedane).
    const curated = CURATED_HANDLES[landing.handle] || [];
    let autoGids = curated.length
      ? await fetchEpirProductGidsByHandles(curated)
      : [];
    if (!autoGids.length) {
      autoGids = landing.productQuery
        ? await fetchEpirProductGidsByQuery(landing.productQuery, {
            limit: ORGANIC_ART_PRODUCT_LIMIT,
          })
        : landing.collectionHandle
          ? await fetchEpirCollectionProductGids(landing.collectionHandle, {
              limit: ORGANIC_ART_PRODUCT_LIMIT,
            })
          : [];
    }
    const productIds = await resolveProductIds(landing, autoGids);
    const meta = await upsertLanding(landing, productIds);
    console.log(
      `[seed-campaign-landings] upsert ${landing.handle} → ${meta?.id} products=${productIds.length}`,
    );
  }

  return merged;
}

async function seedKazkaFull(shopId) {
  const needsAuto = SEED_LANDINGS.some((l) => !l.productIds?.length);
  const autoGids = needsAuto ? await fetchKazkaProductGids(PRODUCT_LIMIT) : [];

  await setCampaignMapping(shopId, SEED_MAPPING);
  console.log('[seed-campaign-landings] campaign_mapping OK', SEED_MAPPING);

  for (const landing of SEED_LANDINGS) {
    const productIds = await resolveProductIds(landing, autoGids);
    const meta = await upsertLanding(landing, productIds);
    console.log(
      `[seed-campaign-landings] upsert ${landing.handle} → ${meta?.id} products=${productIds.length}`,
    );
  }

  return SEED_MAPPING;
}

async function main() {
  console.log(
    `[seed-campaign-landings] shop=${SHOP} mode=${
      MIGRATE_ORGANIC_ART
        ? 'migrate-organic-art'
        : APEX_ONLY
          ? 'apex-only'
          : 'kazka-full'
    } skipInvalid=${SKIP_INVALID} productLimit=${PRODUCT_LIMIT}`,
  );

  const {shop} = await gql(SHOP_ID_QUERY);
  const shopId = shop?.id;
  if (!shopId) {
    throw new Error('shop.id missing');
  }
  console.log(`[seed-campaign-landings] shop.id=${shopId}`);

  const existingMapping = parseMappingJson(shop?.campaignMapping?.value);
  console.log('[seed-campaign-landings] campaign_mapping (before)', existingMapping);

  const finalMapping = MIGRATE_ORGANIC_ART
    ? await migrateOrganicArt(shopId, existingMapping)
    : APEX_ONLY
      ? await seedApexOnly(shopId, existingMapping)
      : await seedKazkaFull(shopId);

  console.log('[seed-campaign-landings] done');
  console.log('[seed-campaign-landings] campaign_mapping (after)', finalMapping);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
