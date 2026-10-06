/**
 * Sekcja E — żywy seed katalogu (bez wypisywania tokenów).
 * Env: root .dev.vars (SHOP_DOMAIN, SHOPIFY_ADMIN_TOKEN) + apps/kazka/.dev.vars (PUBLIC_STOREFRONT_API_TOKEN).
 *
 *   node --import tsx scripts/hotfix2-live-seed-check.mjs
 */
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed.ts';
import {readPresentedProducts} from '../src/catalog/page-product-card.ts';
import {loadPageProductCard} from '../src/catalog/page-product-card.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

function loadDevVars(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const rootVars = loadDevVars(resolve(root, '.dev.vars'));
const kazkaVars = loadDevVars(resolve(root, 'apps/kazka/.dev.vars'));
const chatVars = loadDevVars(resolve(root, 'workers/chat/.dev.vars'));

const shopDomain = rootVars.SHOP_DOMAIN || chatVars.SHOP_DOMAIN || process.env.SHOP_DOMAIN;
const adminToken = rootVars.SHOPIFY_ADMIN_TOKEN || chatVars.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
const kazkaToken =
  process.env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA ||
  chatVars.PUBLIC_STOREFRONT_API_TOKEN_KAZKA ||
  kazkaVars.PUBLIC_STOREFRONT_API_TOKEN ||
  kazkaVars.PRIVATE_STOREFRONT_API_TOKEN;

const report = {
  secrets_present: {
    SHOP_DOMAIN: Boolean(shopDomain),
    SHOPIFY_ADMIN_TOKEN: Boolean(adminToken),
    PUBLIC_STOREFRONT_API_TOKEN_KAZKA_or_kazka_dev: Boolean(kazkaToken),
  },
  cases: {},
};

if (!shopDomain || !adminToken) {
  console.log(JSON.stringify({error: 'missing_admin_env', ...report}, null, 2));
  process.exit(2);
}

const epirEnv = {SHOP_DOMAIN: shopDomain, SHOPIFY_ADMIN_TOKEN: adminToken};
const kazkaEnv = {
  SHOP_DOMAIN: shopDomain,
  SHOPIFY_ADMIN_TOKEN: adminToken,
  ...(kazkaToken ? {PUBLIC_STOREFRONT_API_TOKEN_KAZKA: kazkaToken} : {}),
};

function summarizeCards(cards) {
  return cards.map((card) => ({
    handle: card.handle,
    title: card.title,
    url: card.url,
    price_display_pl: card.price_display_pl ?? card.price_min_display_pl,
    quality_groups: card.quality_price_groups,
    options: Array.isArray(card.options)
      ? card.options
          .filter((opt) => /jako/i.test(String(opt?.name ?? '')))
          .map((opt) => ({name: opt.name, values: opt.values}))
      : [],
  }));
}

async function runCase(name, brand, buyerTurns, env) {
  const seeded = await seedBuyerTurnContext({env, brand, buyerTurns});
  const cards = seeded.snapshots.flatMap((snapshot) => readPresentedProducts(snapshot));
  report.cases[name] = {
    stoneLookup: seeded.stoneLookup,
    handles: cards.map((c) => c.handle),
    urls: cards.map((c) => c.url),
    cards: summarizeCards(cards),
  };
}

await runCase('gk_soliter', 'kazka', ['soliter'], kazkaEnv);
await runCase('gk_szafir_ring', 'kazka', ['pierścionek z szafirem'], kazkaEnv);
await runCase('ge_szafir_ring', 'epir', ['pierścionek z szafirem'], epirEnv);

const pdp = await loadPageProductCard(kazkaEnv, '101-10010-3-7', 'kazka');
if (pdp?.card) {
  const qualityOpt = Array.isArray(pdp.card.options)
    ? pdp.card.options.find((opt) => /jako/i.test(String(opt?.name ?? '')))
    : null;
  const qualities = [
    ...(qualityOpt?.values ?? []),
    ...((pdp.card.quality_price_groups ?? []).flatMap((g) => g.qualities ?? [])),
  ];
  report.cases.gk_soliter_pdp_101_10010_3_7 = {
    handle: pdp.card.handle,
    url: pdp.card.url,
    quality_values: [...new Set(qualities)],
    has_LAB: qualities.some((q) => /lab/i.test(String(q))),
    has_G_VS2: qualities.some((q) => /G\/VS2/i.test(String(q))),
    quality_price_groups: pdp.card.quality_price_groups,
  };
} else {
  report.cases.gk_soliter_pdp_101_10010_3_7 = {error: 'card_not_loaded'};
}

console.log(JSON.stringify(report, null, 2));
