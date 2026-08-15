#!/usr/bin/env node
/**
 * Paczka B — audyt checkoutu apex (Admin API, read-only).
 * Dostawa, płatności (PayPo/Twisto), ostatnie porzucone checkouti.
 *
 *   node scripts/debug/audit-checkout-b.mjs
 *   node scripts/debug/audit-checkout-b.mjs --json
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const API_VERSION = '2026-04';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function normalizeShopHost(raw) {
  let s = trimVal(raw);
  s = s.replace(/^https?:\/\//i, '').split('/')[0];
  return s;
}

function loadFromDevVars() {
  const paths = [
    join(ROOT, '.dev.vars'),
    join(ROOT, 'workers/chat/.dev.vars'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop =
      content.match(/SHOP\s*=\s*(.+)/) ||
      content.match(/(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN|PUBLIC_STORE_DOMAIN)\s*=\s*(.+)/);
    const token = mToken ? trimVal(mToken[1]) : null;
    const shop = mShop ? normalizeShopHost(mShop[1]) : null;
    if (token || shop) return { token, shop };
  }
  return { token: null, shop: null };
}

function resolveCredentials() {
  const fromDev = loadFromDevVars();
  const token =
    process.env.SHOPIFY_ADMIN_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_ACCESS_TOKEN ||
    fromDev.token;
  const shop =
    process.env.SHOP ||
    (process.env.SHOP_DOMAIN ? normalizeShopHost(process.env.SHOP_DOMAIN) : null) ||
    (process.env.SHOPIFY_SHOP_DOMAIN ? normalizeShopHost(process.env.SHOPIFY_SHOP_DOMAIN) : null) ||
    fromDev.shop ||
    'epir-art-silver-jewellery.myshopify.com';
  return { token, shop };
}

async function adminRest(token, shop, path) {
  const url = `https://${shop}/admin/api/${API_VERSION}/${path}`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function adminGraphql(token, shop, query, variables = {}) {
  const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const msg = json.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(`GraphQL: ${msg}`);
  }
  return json.data;
}

const ABANDONED_QUERY = `
  query Abandoned($first: Int!) {
    abandonedCheckouts(first: $first, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          createdAt
          updatedAt
          abandonedCheckoutUrl
          completedAt
          name
          note
          taxesIncluded
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalDiscountSet { shopMoney { amount currencyCode } }
          discountCodes
          shippingAddress { city country province zip firstName lastName }
          billingAddress { city country }
          customer { id email displayName numberOfOrders }
          lineItems(first: 15) {
            edges {
              node {
                title
                quantity
                sku
                variant { id title sku price }
                originalUnitPriceSet { shopMoney { amount currencyCode } }
              }
            }
          }
        }
      }
    }
  }
`;

const SHOP_QUERY = `
  query ShopCheckout {
    shop {
      name
      currencyCode
      checkoutApiSupported
      taxesIncluded
      plan { displayName partnerDevelopment shopifyPlus }
      paymentSettings {
        supportedDigitalWallets
      }
    }
    deliveryProfiles(first: 10) {
      edges {
        node {
          id
          name
          default
          profileLocationGroups {
            locationGroup { locations(first: 5) { edges { node { name isActive } } } }
            locationGroupZones(first: 10) {
              edges {
                node {
                  zone { name countries { code { countryCode } name } }
                  methodDefinitions(first: 10) {
                    edges {
                      node {
                        name
                        active
                        rateProvider {
                          ... on DeliveryRateDefinition {
                            price { amount currencyCode }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const SHOP_META_QUERY = `
  query ShopMeta {
    shop {
      customerAccounts
      customerAccountsV2 { customerAccountsVersion loginRequiredAtCheckout }
    }
    appInstallations(first: 25) {
      edges {
        node {
          app { title handle }
        }
      }
    }
  }
`;

async function tryShopifyql(token, shop) {
  const query = `
    query Shopifyql {
      shopifyqlQuery(query: "FROM checkouts SHOW checkout_id, total_price, created_at, completed_at, email, abandoned_checkout_url WHERE created_at >= -30d ORDER BY created_at DESC LIMIT 20") {
        tableData { columns { name } rows }
        parseErrors
      }
    }
  `;
  try {
    const data = await adminGraphql(token, shop, query);
    return data?.shopifyqlQuery ?? null;
  } catch (e) {
    return { error: e.message };
  }
}

function money(set) {
  const m = set?.shopMoney;
  if (!m) return null;
  return `${m.amount} ${m.currencyCode}`;
}

function summarizeCheckout(node) {
  const items = node.lineItems?.edges?.map((e) => e.node) ?? [];
  return {
    id: node.id,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    total: money(node.totalPriceSet),
    subtotal: money(node.subtotalPriceSet),
    discountCodes: node.discountCodes ?? [],
    customerEmail: node.customer?.email ?? null,
    customerOrders: node.customer?.numberOfOrders ?? null,
    shippingCity: node.shippingAddress?.city ?? null,
    shippingCountry: node.shippingAddress?.country ?? null,
    lineItems: items.map((li) => ({
      title: li.title,
      qty: li.quantity,
      sku: li.sku || li.variant?.sku,
      variant: li.variant?.title,
      price: money(li.originalUnitPriceSet),
    })),
    recoveryUrl: node.abandonedCheckoutUrl,
  };
}

async function main() {
  const jsonOut = process.argv.includes('--json');
  const { token, shop } = resolveCredentials();
  if (!token) {
    console.error('Brak SHOPIFY_ADMIN_TOKEN w env lub .dev.vars');
    process.exit(1);
  }

  const [shopData, abandonedData, shopifyql, shopMeta] = await Promise.all([
    adminGraphql(token, shop, SHOP_QUERY),
    adminGraphql(token, shop, ABANDONED_QUERY, { first: 15 }),
    tryShopifyql(token, shop),
    adminGraphql(token, shop, SHOP_META_QUERY).catch((e) => ({ error: e.message })),
  ]);

  let shopifyPayments = null;
  try {
    const pay = await adminGraphql(token, shop, `
      query { shopifyPaymentsAccount { activated country defaultCurrency } }
    `);
    shopifyPayments = pay.shopifyPaymentsAccount;
  } catch {
    shopifyPayments = { note: 'brak scope read_shopify_payments' };
  }

  let paymentGateways = [];
  let shopRest = null;
  try {
    const gw = await adminRest(token, shop, 'payment_gateways.json');
    paymentGateways = gw.json?.payment_gateways ?? [];
  } catch (e) {
    paymentGateways = [{ error: e.message }];
  }
  try {
    shopRest = (await adminRest(token, shop, 'shop.json')).json?.shop;
  } catch {
    shopRest = null;
  }

  const abandoned = abandonedData.abandonedCheckouts.edges.map((e) => summarizeCheckout(e.node));
  const recentThree = abandoned.slice(0, 3);

  const deliverySummary = [];
  for (const profileEdge of shopData.deliveryProfiles?.edges ?? []) {
    const profile = profileEdge.node;
    for (const lg of profile.profileLocationGroups ?? []) {
      for (const zoneEdge of lg.locationGroupZones?.edges ?? []) {
        const z = zoneEdge.node;
        const methods =
          z.methodDefinitions?.edges?.map((m) => ({
            name: m.node.name,
            active: m.node.active,
            price: m.node.rateProvider?.price,
          })) ?? [];
        deliverySummary.push({
          profile: profile.name,
          default: profile.default,
          zone: z.zone?.name,
          countries: z.zone?.countries?.map((c) => c.code?.countryCode ?? c.name),
          methods,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    shop: shop,
    shopInfo: shopData.shop,
    shopifyPayments: shopifyPayments ?? shopData.shopifyPaymentsAccount,
    paymentGateways,
    shopRestPlan: shopRest?.plan_name ?? null,
    delivery: deliverySummary,
    abandonedCheckoutsCount: abandoned.length,
    abandonedCheckoutsRecent: abandoned,
    abandonedDeepDive: recentThree,
    shopMeta,
    ordersAug2026: await (async () => {
      try {
        const q = `
          query {
            allOrders: ordersCount(query: "created_at:>=2026-08-01 created_at:<=2026-08-15") { count }
            paidOrders: ordersCount(query: "created_at:>=2026-08-01 created_at:<=2026-08-15 financial_status:paid") { count }
          }
        `;
        const d = await adminGraphql(token, shop, q);
        return { total: d.allOrders?.count, paid: d.paidOrders?.count };
      } catch (e) {
        return { error: e.message };
      }
    })(),
    shopifyqlLast30d: shopifyql,
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== PACZKA B — audyt checkoutu ===');
  console.log(`Sklep: ${shop}`);
  console.log(`Waluta: ${shopData.shop?.currencyCode}`);
  console.log(`Shopify Payments: ${report.shopifyPayments?.activated ? 'aktywne' : report.shopifyPayments?.note ?? 'nie/nieznane'}`);
  console.log(`Plan: ${report.shopRestPlan ?? '—'}`);
  if (report.ordersAug2026) {
    console.log(`Zamówienia 1–15.08: ${report.ordersAug2026.total ?? '?'} (paid: ${report.ordersAug2026.paid ?? '?'})`);
  }
  if (report.shopMeta?.shop) {
    console.log(`Konta klientów: ${report.shopMeta.shop.customerAccounts}`);
    const ca = report.shopMeta.shop.customerAccountsV2;
    if (ca) console.log(`Login przy checkout: ${ca.loginRequiredAtCheckout ?? '—'}`);
  }
  const payApps = report.shopMeta?.appInstallations?.edges ?? [];
  if (payApps.length) {
    console.log('\n--- Aplikacje płatności ---');
    for (const e of payApps) console.log(`  - ${e.node.app.title} (${e.node.app.handle})`);
  }

  console.log('\n--- Bramki płatności (REST) ---');
  for (const g of report.paymentGateways) {
    if (g.error) {
      console.log('  err:', g.error);
      continue;
    }
    console.log(`  - ${g.name} | ${g.type} | ${g.enabled ? 'ON' : 'OFF'}`);
  }

  console.log('\n--- Dostawa (delivery profiles) ---');
  for (const d of deliverySummary) {
    console.log(`  [${d.profile}${d.default ? ', default' : ''}] ${d.zone ?? '?'} (${(d.countries ?? []).join(', ')})`);
    for (const m of d.methods) {
      const price = m.price ? `${m.price.amount} ${m.price.currencyCode}` : 'dynamic/app';
      console.log(`    - ${m.name} (${m.active ? 'active' : 'off'}) ${price}`);
    }
  }

  console.log('\n--- Porzucone checkouti (ostatnie 15) ---');
  for (const c of abandoned) {
    console.log(
      `  ${c.createdAt?.slice(0, 10)} | ${c.total} | ${c.customerEmail ?? 'brak email'} | ${c.lineItems?.length ?? 0} poz. | ${c.shippingCity ?? '—'}`,
    );
  }

  console.log('\n--- Deep dive: 3 najnowsze ---');
  for (const c of recentThree) {
    console.log(JSON.stringify(c, null, 2));
  }

  if (shopifyql?.tableData) {
    console.log('\n--- ShopifyQL checkouts (-30d) ---');
    console.log(JSON.stringify(shopifyql.tableData, null, 2));
  } else if (shopifyql?.error) {
    console.log('\nShopifyQL: pominięty —', shopifyql.error);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
