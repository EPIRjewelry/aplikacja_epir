#!/usr/bin/env node
/**
 * Verify Apex campaign_mapping + forest-premium / artisan landings (Admin API).
 */
import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const TYPE = '$app:campaign_landing';

function loadToken() {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../.dev.vars', '../workers/chat/.dev.vars']) {
    const fp = join(dir, rel);
    if (!existsSync(fp)) continue;
    const c = readFileSync(fp, 'utf8');
    const m =
      c.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      c.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
}

const TOKEN = loadToken();
const SHOP = process.env.SHOP || DEFAULT_SHOP;
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
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const data = await gql(`#graphql
  query VerifyApex {
    shop {
      campaignMapping: metafield(namespace: "app", key: "campaign_mapping") {
        value
      }
    }
    forest: metaobjectByHandle(handle: {type: "${TYPE}", handle: "forest-premium-landing"}) {
      handle
      heroTitle: field(key: "hero_title") { value }
      productIds: field(key: "product_ids") { value }
      ctaUrl: field(key: "cta_url") { value }
    }
    rings: metaobjectByHandle(handle: {type: "${TYPE}", handle: "artisan-rings-landing"}) {
      handle
      heroTitle: field(key: "hero_title") { value }
      productIds: field(key: "product_ids") { value }
      ctaUrl: field(key: "cta_url") { value }
    }
    news: metaobjectByHandle(handle: {type: "${TYPE}", handle: "artisan-new-landing"}) {
      handle
      heroTitle: field(key: "hero_title") { value }
      productIds: field(key: "product_ids") { value }
      ctaUrl: field(key: "cta_url") { value }
    }
    organic: metaobjectByHandle(handle: {type: "${TYPE}", handle: "organic-art-landing"}) {
      handle
      heroTitle: field(key: "hero_title") { value }
      productIds: field(key: "product_ids") { value }
      ctaUrl: field(key: "cta_url") { value }
    }
    gold: metaobjectByHandle(handle: {type: "${TYPE}", handle: "artisan-gold-landing"}) {
      handle
      heroTitle: field(key: "hero_title") { value }
      productIds: field(key: "product_ids") { value }
      ctaUrl: field(key: "cta_url") { value }
    }
  }
`);

const mapping = JSON.parse(data.shop.campaignMapping?.value || '{}');
function summarize(mo) {
  if (!mo) return null;
  let productCount = 0;
  try {
    productCount = JSON.parse(mo.productIds?.value || '[]').length;
  } catch {
    productCount = -1;
  }
  return {
    handle: mo.handle,
    heroTitle: mo.heroTitle?.value,
    ctaUrl: mo.ctaUrl?.value,
    productCount,
  };
}

const out = {
  campaign_mapping: mapping,
  landings: {
    forest_premium: summarize(data.forest),
    artisan_rings: summarize(data.rings),
    artisan_new: summarize(data.news),
    organic_art: summarize(data.organic),
    artisan_gold: summarize(data.gold),
  },
  apexKeysPresent: {
    forest_premium: mapping.forest_premium === 'forest-premium-landing',
    artisan_rings: mapping.artisan_rings === 'artisan-rings-landing',
    artisan_new: mapping.artisan_new === 'artisan-new-landing',
    organic_art: mapping.organic_art === 'organic-art-landing',
    artisan_gold: mapping.artisan_gold === 'artisan-gold-landing',
  },
};

console.log(JSON.stringify(out, null, 2));
