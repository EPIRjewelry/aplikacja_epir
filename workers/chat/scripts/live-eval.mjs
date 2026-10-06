/**
 * Bramka live-eval przed merge (sekcja 8 promptu Etap 2).
 * Env: root .dev.vars + apps/kazka/.dev.vars (tokenów nie wypisuje).
 *
 *   node --import tsx scripts/live-eval.mjs
 */
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed.ts';
import {formatPageCardReply, loadPageProductCard, readPresentedProducts} from '../src/catalog/page-product-card.ts';
import {formatCatalogBrowseReply, guardBuyerCatalogReply} from '../src/catalog/buyer-reply-guard.ts';
import {productMinPricePlnForOrigin, originAskForTurn} from '../src/catalog/stone-origin.ts';

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

const epirEnv = {SHOP_DOMAIN: shopDomain, SHOPIFY_ADMIN_TOKEN: adminToken};
const kazkaEnv = {
  SHOP_DOMAIN: shopDomain,
  SHOPIFY_ADMIN_TOKEN: adminToken,
  ...(kazkaToken ? {PUBLIC_STOREFRONT_API_TOKEN_KAZKA: kazkaToken} : {}),
};

const cases = JSON.parse(readFileSync(resolve(here, '../test/live-eval-cases.json'), 'utf8')).cases;

function haystack(card) {
  return `${card.title ?? ''} ${card.handle ?? ''} ${card.description ?? ''}`.toLocaleLowerCase('pl-PL');
}

async function runPdpCase(def) {
  const env = def.brand === 'kazka' ? kazkaEnv : epirEnv;
  const loaded = await loadPageProductCard(env, def.pageHandle, def.brand);
  const card = loaded?.card;
  const errors = [];
  if (!card) errors.push('page_card_missing');
  const reply = card ? formatPageCardReply(card) : '';
  const groups = card?.quality_price_groups;
  for (const fragment of def.qualityPricesInclude ?? []) {
    const blob = JSON.stringify(groups ?? card ?? {});
    if (!blob.includes(fragment)) errors.push(`missing price ${fragment}`);
  }
  for (const fragment of def.qualitiesInclude ?? []) {
    const blob = JSON.stringify({options: card?.options, groups});
    if (!blob.includes(fragment)) errors.push(`missing quality ${fragment}`);
  }
  for (const pattern of def.replyMustNotMatch ?? []) {
    if (new RegExp(pattern, 'iu').test(reply)) errors.push(`reply forbidden /${pattern}/`);
  }
  return {
    id: def.id,
    pass: errors.length === 0,
    errors,
    quote: reply.slice(0, 280).replace(/\s+/g, ' ').trim(),
    handles: card?.handle ? [card.handle] : [],
  };
}

async function runCase(def) {
  if (def.type === 'pdp') return runPdpCase(def);
  const env = def.brand === 'kazka' ? kazkaEnv : epirEnv;
  const turns = [];
  let seeded = null;
  for (const turn of def.turns) {
    turns.push(turn);
    seeded = await seedBuyerTurnContext({env, brand: def.brand, buyerTurns: turns});
  }
  const cards = seeded.snapshots.flatMap((snapshot) => readPresentedProducts(snapshot));
  let reply = guardBuyerCatalogReply(formatCatalogBrowseReply(cards), {
    buyerTurns: turns,
    catalogSnapshots: seeded.snapshots,
    stoneLookup: seeded.stoneLookup,
    brand: def.brand,
  }).text;
  const replySansUrls = reply
    .replace(/\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\/products\/[^\s)]+/g, '');
  const errors = [];

  if ((def.minCards ?? 0) > cards.length) {
    errors.push(`minCards ${def.minCards}, got ${cards.length}`);
  }
  for (const fragment of def.urlIncludes ?? []) {
    const hit = cards.some((c) => String(c.url ?? '').includes(fragment));
    if (!hit) errors.push(`missing url fragment ${fragment}`);
  }
  if (def.urlDomain) {
    const bad = cards.filter((c) => c.url && !String(c.url).includes(def.urlDomain));
    if (bad.length) errors.push(`wrong domain on ${bad.map((c) => c.handle).join(',')}`);
  }
  for (const pattern of def.replyMustNotMatch ?? []) {
    if (new RegExp(pattern, 'iu').test(replySansUrls)) errors.push(`reply matches forbidden /${pattern}/`);
  }
  for (const pattern of def.lastTurnMustNotMatch ?? []) {
    if (new RegExp(pattern, 'iu').test(replySansUrls)) errors.push(`reply matches forbidden /${pattern}/`);
  }
  for (const pattern of ['metafield', 'w tej turze', 'zakres karty']) {
    if (new RegExp(pattern, 'iu').test(replySansUrls)) errors.push(`global leak /${pattern}/`);
  }
  for (const needle of def.everyCardHaystackMustMatch ?? []) {
    const bad = cards.filter((c) => !haystack(c).includes(needle.toLocaleLowerCase('pl-PL')));
    if (bad.length) errors.push(`cards missing ${needle}: ${bad.map((c) => c.handle).join(',')}`);
  }
  for (const needle of def.everyCardHaystackMustNotMatch ?? []) {
    const bad = cards.filter((c) => haystack(c).includes(needle.toLocaleLowerCase('pl-PL')));
    if (bad.length) errors.push(`cards must not contain ${needle}: ${bad.map((c) => c.handle).join(',')}`);
  }
  if (def.maxPricePln != null) {
    const ask = originAskForTurn(turns);
    for (const card of cards) {
      const min = productMinPricePlnForOrigin(card, ask);
      if (min != null && min > def.maxPricePln + 0.01) {
        errors.push(`price ${min} > cap ${def.maxPricePln} on ${card.handle}`);
      }
    }
  }
  if (def.checkLinks) {
    for (const card of cards) {
      const url = card.url;
      if (!url) continue;
      try {
        const res = await fetch(url, {method: 'HEAD', redirect: 'follow'});
        if (!res.ok) errors.push(`HTTP ${res.status} for ${url}`);
      } catch (error) {
        errors.push(`link check failed ${url}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  return {
    id: def.id,
    pass: errors.length === 0,
    errors,
    quote: reply.slice(0, 280).replace(/\s+/g, ' ').trim(),
    handles: cards.map((c) => c.handle),
  };
}

if (!shopDomain || !adminToken) {
  console.error(JSON.stringify({error: 'missing_admin_env'}, null, 2));
  process.exit(2);
}

const results = [];
for (const def of cases) {
  results.push(await runCase({...def, checkLinks: true}));
}

const table = results.map((row) => ({
  case: row.id,
  status: row.pass ? 'PASS' : 'FAIL',
  quote: row.quote,
  errors: row.errors,
  handles: row.handles,
}));

console.log(JSON.stringify({passed: results.every((r) => r.pass), results: table}, null, 2));
process.exit(results.every((r) => r.pass) ? 0 : 1);
