#!/usr/bin/env node
/**
 * Sprawdza rozmiar list CRM w Google Ads (GAQL).
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  const paths = [
    join(dir, '../.dev.vars'),
    join(dir, '../workers/marketing-ingest/.dev.vars'),
  ];
  const out = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!out[t.slice(0, i).trim()]) out[t.slice(0, i).trim()] = v;
    }
  }
  return out;
}

const vars = loadDevVars();
const origin = (process.env.MARKETING_INGEST_ORIGIN || vars.MARKETING_INGEST_ORIGIN || '').replace(/\/$/, '');
const key = process.env.MARKETING_OPS_PREVIEW_KEY || vars.MARKETING_OPS_PREVIEW_KEY || '';

const LIST_NAMES = [
  'EPIR_CRM_Email_Consent',
  'EPIR_CRM_High_Value',
  'EPIR_CRM_Repeat',
];

async function main() {
  // 1) dry-run sync — segment counts + DM error
  if (origin && key) {
    const syncRes = await fetch(`${origin}/ops/customer-match-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dryRun: true, attachSignals: false }),
    });
    const sync = await syncRes.json();
    console.log('=== SYNC DRY-RUN (segmenty Shopify) ===');
    console.log(JSON.stringify({
      shopifyCount: sync.shopifyCount,
      uploads: sync.uploads?.map((u) => ({
        listName: u.listName,
        uniqueCount: u.uniqueCount,
        membersSent: u.membersSent,
        error: u.error ? u.error.slice(0, 120) : null,
        validateOnly: u.validateOnly,
      })),
    }, null, 2));
  }

  // 2) user list sizes via GAQL through worker search-terms path won't work — use listing audit pattern
  // Inline OAuth + GAQL if credentials local
  const cid = vars.GOOGLE_ADS_CLIENT_ID;
  const sec = vars.GOOGLE_ADS_CLIENT_SECRET;
  const rt = vars.GOOGLE_ADS_REFRESH_TOKEN;
  const devTok = vars.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = (vars.GOOGLE_ADS_CUSTOMER_ID || '5311644752').replace(/-/g, '');
  const loginCid = (vars.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '');

  if (!cid || !sec || !rt || !devTok) {
    console.log('\n=== ROZMIARY LIST (GAQL) ===');
    console.log('Pominięto — brak pełnych GOOGLE_ADS_* lokalnie. Sprawdź rozmiary w Google Ads UI → Segmenty odbiorców.');
    return;
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: sec,
      refresh_token: rt,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('OAuth refresh failed', tokenData);
    return;
  }

  const names = LIST_NAMES.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(', ');
  const query = `
    SELECT
      user_list.name,
      user_list.id,
      user_list.size_for_display,
      user_list.size_for_search,
      user_list.membership_status,
      user_list.match_rate_percentage
    FROM user_list
    WHERE user_list.name IN (${names})
  `.trim();

  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    'developer-token': devTok,
    'Content-Type': 'application/json',
  };
  if (loginCid) headers['login-customer-id'] = loginCid;

  const res = await fetch(
    `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error('GAQL error', res.status, text.slice(0, 500));
    return;
  }

  const data = JSON.parse(text);
  const rows = (data.results || []).map((r) => ({
    name: r.userList?.name,
    id: r.userList?.id,
    sizeDisplay: r.userList?.sizeForDisplay ?? r.userList?.size_for_display,
    sizeSearch: r.userList?.sizeForSearch ?? r.userList?.size_for_search,
    membershipStatus: r.userList?.membershipStatus ?? r.userList?.membership_status,
    matchRate: r.userList?.matchRatePercentage ?? r.userList?.match_rate_percentage,
  }));

  console.log('\n=== ROZMIARY LIST CRM (Google Ads) ===');
  console.log(JSON.stringify(rows, null, 2));
  console.log('\nUwaga: Google pokazuje 0 dopóki lista ma <100 dopasowań (polityka prywatności).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
