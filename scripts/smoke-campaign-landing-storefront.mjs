#!/usr/bin/env node
/**
 * Storefront GraphQL smoke: campaign_mapping + campaign landing metaobject.
 */
import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function loadKazkaEnv() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const p = join(dir, '../apps/kazka/.dev.vars');
  if (!existsSync(p)) throw new Error('missing apps/kazka/.dev.vars');
  const c = readFileSync(p, 'utf8');
  const get = (k) => {
    const m = c.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm'));
    return m ? trimVal(m[1]) : null;
  };
  return {
    shop: get('PUBLIC_STORE_DOMAIN'),
    privateToken: get('PRIVATE_STOREFRONT_API_TOKEN'),
    publicToken: get('PUBLIC_STOREFRONT_API_TOKEN'),
    version: get('PUBLIC_STOREFRONT_API_VERSION') || '2025-10',
  };
}

const env = loadKazkaEnv();
const type =
  process.env.PUBLIC_CAMPAIGN_LANDING_TYPE ||
  'app--280344821761--campaign_landing';
const endpoint = `https://${env.shop}/api/${env.version}/graphql.json`;
const headers = {'Content-Type': 'application/json'};
if (env.privateToken) {
  headers['Shopify-Storefront-Private-Token'] = env.privateToken;
} else {
  headers['X-Shopify-Storefront-Access-Token'] = env.publicToken;
}

async function sf(query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({query, variables}),
  });
  const json = await res.json();
  return {status: res.status, json};
}

const mapping = await sf(`#graphql
  query {
    shop {
      campaignMapping: metafield(namespace: "app", key: "campaign_mapping") {
        value
      }
    }
  }
`);
const mappingValue = mapping.json?.data?.shop?.campaignMapping?.value;
let mappingParsed = null;
try {
  mappingParsed = mappingValue ? JSON.parse(mappingValue) : null;
} catch {
  mappingParsed = null;
}
console.log('mapping status', mapping.status);
console.log('mapping', mappingParsed);
if (mapping.json?.errors) console.log('mapping errors', mapping.json.errors);

const landing = await sf(
  `#graphql
  query($handle: MetaobjectHandleInput!) {
    metaobject(handle: $handle) {
      id
      handle
      type
      heroTitle: field(key: "hero_title") { value }
      productIds: field(key: "product_ids") { value }
      ctaLabel: field(key: "cta_label") { value }
    }
  }
`,
  {handle: {type, handle: 'default-landing'}},
);
console.log('landing status', landing.status);
console.log(
  'landing handle',
  landing.json?.data?.metaobject?.handle,
  'title',
  landing.json?.data?.metaobject?.heroTitle?.value,
);
if (landing.json?.errors) console.log('landing errors', landing.json.errors);

const ok =
  Boolean(landing.json?.data?.metaobject?.heroTitle?.value) &&
  Boolean(mappingParsed?.default);
console.log(ok ? 'STOREFRONT_SMOKE_PASS' : 'STOREFRONT_SMOKE_FAIL');
process.exit(ok ? 0 : 1);
