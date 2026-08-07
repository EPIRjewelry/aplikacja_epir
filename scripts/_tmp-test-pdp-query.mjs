import {readFileSync, existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {readFileSync as r} from 'fs';

const dir = dirname(fileURLToPath(import.meta.url));
const queryText = r(join(dir, '../apps/kazka/app/routes/products.$handle.tsx'), 'utf8');
const match = queryText.match(/const PRODUCT_QUERY = `([\s\S]*?)`;/);
if (!match) throw new Error('PRODUCT_QUERY not found');
const query = match[1];

function loadEnv() {
  for (const p of [
    join(dir, '../apps/kazka/.dev.vars'),
    join(dir, '../.dev.vars'),
  ]) {
    if (!existsSync(p)) continue;
    const c = readFileSync(p, 'utf8');
    const token =
      c.match(/PUBLIC_STOREFRONT_API_TOKEN\s*=\s*(.+)/)?.[1]?.trim() ||
      c.match(/PUBLIC_STOREFRONT_API_TOKEN_KAZKA\s*=\s*(.+)/)?.[1]?.trim();
    const shop =
      c.match(/PUBLIC_STORE_DOMAIN\s*=\s*(.+)/)?.[1]?.trim() ||
      'epir-art-silver-jewellery.myshopify.com';
    const version =
      c.match(/PUBLIC_STOREFRONT_API_VERSION\s*=\s*(.+)/)?.[1]?.trim() ||
      '2025-10';
    if (token) return {token, shop, version};
  }
  throw new Error('No storefront token in .dev.vars');
}

const {token, shop, version} = loadEnv();
const endpoint = `https://${shop}/api/${version}/graphql.json`;

const variables = {
  handle: '101-10075',
  selectedOptions: [
    {name: 'Próba złota', value: '14 karatów'},
    {name: 'Jakość', value: 'D/VVS2'},
  ],
};

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': token,
  },
  body: JSON.stringify({query, variables}),
});
const json = await res.json();
if (json.errors) {
  console.error('GRAPHQL ERRORS:', JSON.stringify(json.errors, null, 2));
  process.exit(1);
}
const media = json.data?.product?.media?.nodes ?? [];
console.log(
  JSON.stringify(
    {
      title: json.data?.product?.title,
      mediaTypes: media.map((m) => ({
        type: m.mediaContentType,
        hasSources: Boolean(m.sources?.length),
        hasImage: Boolean(m.image?.url),
      })),
    },
    null,
    2,
  ),
);
