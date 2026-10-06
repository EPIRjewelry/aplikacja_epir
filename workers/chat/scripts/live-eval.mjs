/**
 * Bramka live-eval przed merge (sekcja 8 promptu PR #147).
 * Ocenia pełną ścieżkę odpowiedzi klienta (finalizeBuyerFacingReply), nie sam seed.
 *
 *   node --import tsx scripts/live-eval.mjs
 */
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed.ts';
import {formatCatalogBrowseReply} from '../src/catalog/buyer-reply-guard.ts';
import {productMinPricePlnForOrigin, originAskForTurn} from '../src/catalog/stone-origin.ts';
import {readPresentedProducts} from '../src/catalog/page-product-card.ts';
import {finalizeBuyerFacingReply} from '../src/catalog/buyer-reply-pipeline.ts';
import {extractPlnAmountsFromAssistantText} from '../src/pricing-guard.ts';

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

const DEFAULT_BAD_DRAFTS = {
  gk_natural_diamond_assortment:
    'Nie mam teraz w ofercie naturalnego kamienia „diament”.',
  gk_natural_diamond_budget:
    'Nie mam teraz w ofercie naturalnego kamienia „diament”.',
  ge_natural_sapphire_ask:
    'Te pozycje są w katalogu:\n- Szafir syntetyczny — od 1200 zł.',
  gk_pdp_soliter_natural_lab_price:
    'Cena wynosi od 2737,12 zł do 7945,92 zł.',
  gk_pdp_soliter_certificate:
    'Przepraszam, chwilowo nie mogę dokończyć odpowiedzi. Napisz proszę jeszcze raz za moment.',
  ge_pdp_moissanit_origin:
    'od 3374,12 zł do 4120,00 zł — rozmiary 12–18.',
};

function haystack(card) {
  return `${card.title ?? ''} ${card.handle ?? ''} ${card.description ?? ''} ${card.main_stone ?? ''}`.toLocaleLowerCase('pl-PL');
}

function replySansUrls(reply) {
  return reply
    .replace(/\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\/products\/[^\s)]+/g, '');
}

function assertReply(def, reply, errors) {
  const replySans = replySansUrls(reply);
  for (const pattern of def.replyMustMatch ?? []) {
    if (!new RegExp(pattern, 'iu').test(replySans)) errors.push(`reply missing /${pattern}/`);
  }
  for (const pattern of def.replyMustNotMatch ?? []) {
    if (new RegExp(pattern, 'iu').test(replySans)) errors.push(`reply forbidden /${pattern}/`);
  }
  for (const pattern of def.lastTurnMustNotMatch ?? []) {
    if (new RegExp(pattern, 'iu').test(replySans)) errors.push(`reply forbidden /${pattern}/`);
  }
  for (const pattern of ['metafield', 'w tej turze', 'zakres karty', 'chwilowo nie mogę']) {
    if (new RegExp(pattern, 'iu').test(replySans)) errors.push(`global leak /${pattern}/`);
  }
  if (def.replyMustContainPrices?.length) {
    const amounts = extractPlnAmountsFromAssistantText(reply);
    for (const fragment of def.replyMustContainPrices) {
      const expected = Number(String(fragment).replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!amounts.some((amount) => Math.abs(amount - expected) < 1)) {
        errors.push(`reply missing price ~${fragment}`);
      }
    }
  }
  if (def.maxReplyPricePln != null) {
    for (const amount of extractPlnAmountsFromAssistantText(reply)) {
      if (amount > def.maxReplyPricePln + 0.01) errors.push(`reply price ${amount} > cap ${def.maxReplyPricePln}`);
    }
  }
}

async function runCase(def) {
  const env = def.brand === 'kazka' ? kazkaEnv : epirEnv;
  const turns = [...(def.turns ?? [])];
  const latest = turns[turns.length - 1] ?? '';
  const seeded = await seedBuyerTurnContext({
    env,
    brand: def.brand,
    buyerTurns: turns,
    productHandle: def.pageHandle,
  });
  const cards = seeded.snapshots.flatMap((snapshot) => readPresentedProducts(snapshot));
  const errors = [];

  if ((def.minCards ?? 0) > cards.length) {
    errors.push(`minCards ${def.minCards}, got ${cards.length}`);
  }
  for (const fragment of def.urlIncludes ?? []) {
    const hit = cards.some((c) => String(c.url ?? '').includes(fragment));
    if (!hit) errors.push(`missing url fragment ${fragment}`);
  }
  if (def.preferHandle) {
    const idx = cards.findIndex((c) => c.handle === def.preferHandle);
    if (idx < 0) errors.push(`missing preferred handle ${def.preferHandle}`);
    else if (idx > 1) errors.push(`preferred handle ${def.preferHandle} at index ${idx}, want top 2`);
  }
  if (def.urlDomain) {
    const bad = cards.filter((c) => c.url && !String(c.url).includes(def.urlDomain));
    if (bad.length) errors.push(`wrong domain on ${bad.map((c) => c.handle).join(',')}`);
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
        errors.push(`seed price ${min} > cap ${def.maxPricePln} on ${card.handle}`);
      }
    }
  }

  const draft =
    def.modelDraft ??
    DEFAULT_BAD_DRAFTS[def.id] ??
    (cards.length ? formatCatalogBrowseReply(cards) : 'Nie mam teraz w ofercie.');

  const reply = finalizeBuyerFacingReply({
    text: draft,
    userMessage: latest,
    buyerTurns: turns,
    catalogSnapshots: seeded.snapshots,
    stoneLookup: seeded.stoneLookup,
    brand: def.brand,
    storefrontId: def.brand === 'kazka' ? 'kazka' : def.brand === 'zareczyny' ? 'zareczyny' : 'epir',
    pageCard: seeded.pageCard,
    aboutPageProduct: seeded.aboutPageProduct,
  });

  assertReply(def, reply, errors);

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
    quote: reply.slice(0, 320).replace(/\s+/g, ' ').trim(),
    handles: cards.map((c) => c.handle),
  };
}

if (!shopDomain || !adminToken) {
  console.error(JSON.stringify({error: 'missing_admin_env'}, null, 2));
  process.exit(2);
}

const results = [];
for (const def of cases) {
  results.push(await runCase({...def, checkLinks: def.checkLinks !== false}));
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
