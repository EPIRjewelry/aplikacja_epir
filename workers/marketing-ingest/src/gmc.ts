/**
 * Google Merchant API (read-only) — account issues, aggregate product statuses, product issues.
 * Scope: https://www.googleapis.com/auth/content
 * Dedicated Merchant OAuth client (not Ads). Scope: content.
 *
 * Headline approved/pending/disapproved = SHOPPING_ADS + PL only (not all countries/programs).
 */

export interface GmcEnv {
  GOOGLE_MERCHANT_CLIENT_ID?: string;
  GOOGLE_MERCHANT_CLIENT_SECRET?: string;
  GOOGLE_MERCHANT_REFRESH_TOKEN?: string;
  /** Merchant Center account id (digits only or accounts/{id}). */
  GOOGLE_MERCHANT_ID?: string;
}

/** Canonical slice for EPIR Shopping / PMax ops. */
export const GMC_HEADLINE_CONTEXT = 'SHOPPING_ADS';
export const GMC_HEADLINE_COUNTRY = 'PL';

export type GmcAccountIssue = {
  name: string;
  title: string;
  severity: string;
  detail: string;
  documentationUri: string;
};

export type GmcAggregateIssue = {
  code: string;
  attribute: string;
  severity: string;
  productCount: number;
  detail: string;
  documentationUri: string;
};

export type GmcAggregateStatus = {
  reportingContext: string;
  country: string;
  approvedCount: number;
  pendingCount: number;
  disapprovedCount: number;
  statistics: Record<string, number>;
  itemLevelIssues: GmcAggregateIssue[];
};

export type GmcProductIssue = {
  offerId: string;
  title: string;
  itemId: string;
  severity: string;
  attribute: string;
  code: string;
  detail: string;
  destination: string;
  resolution: string;
  documentationUri: string;
};

export type GmcIssueCode = {
  code: string;
  attribute: string;
  severity: string;
  productCount: number;
};

export type GmcDiagnosticsBody = {
  ok: boolean;
  skipped?: boolean;
  skipReason?: string;
  merchantId: string | null;
  /** Explicit headline slice. */
  reportingContext: string;
  country: string;
  accountIssues: GmcAccountIssue[];
  aggregateStatuses: GmcAggregateStatus[];
  productIssues: GmcProductIssue[];
  /** Full issue codes from aggregateProductStatuses for SHOPPING_ADS+PL. */
  issueCodes: GmcIssueCode[];
  apiErrors: Array<{ endpoint: string; status: number; message: string }>;
  summary: {
    accountIssueCount: number;
    productIssueCount: number;
    productsScanned: number;
    productsWithIssues: number;
    /** SHOPPING_ADS + PL only */
    approvedTotal: number;
    pendingTotal: number;
    disapprovedTotal: number;
  };
};

const CONTENT_SCOPE_HINT = 'https://www.googleapis.com/auth/content';
const MAX_PRODUCT_PAGES = 5;
const MAX_AGGREGATE_PAGES = 20;
const PAGE_SIZE = 250;
const TOP_PRODUCT_ISSUES = 40;

function normalizeMerchantId(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const m = /^accounts\/(\d+)$/i.exec(t);
  if (m) return m[1];
  return t.replace(/\D/g, '') || t;
}

async function refreshMerchantAccessToken(env: GmcEnv): Promise<string | null> {
  const cid = (env.GOOGLE_MERCHANT_CLIENT_ID ?? '').trim();
  const sec = (env.GOOGLE_MERCHANT_CLIENT_SECRET ?? '').trim();
  const rt = (env.GOOGLE_MERCHANT_REFRESH_TOKEN ?? '').trim();
  if (!cid || !sec || !rt) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: sec,
      refresh_token: rt,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    console.error('[MARKETING_INGEST] GMC token refresh failed', res.status, data.error ?? '');
    return null;
  }
  return data.access_token;
}

async function merchantGet<T>(
  access: string,
  url: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: text.slice(0, 800) };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: res.status, body: 'invalid JSON' };
  }
}

type RawAccountIssue = {
  name?: string;
  title?: string;
  severity?: string;
  detail?: string;
  documentationUri?: string;
};

type RawAggregateItemIssue = {
  code?: string;
  severity?: string;
  attribute?: string;
  detail?: string;
  description?: string;
  documentationUri?: string;
  documentation?: string;
  productCount?: string | number;
};

type RawAggregate = {
  name?: string;
  reportingContext?: string;
  countryCode?: string;
  country?: string;
  stats?: Record<string, string | number>;
  statistics?: {
    activeCount?: string | number;
    pendingCount?: string | number;
    disapprovedCount?: string | number;
    approvedCount?: string | number;
    [k: string]: string | number | undefined;
  };
  itemLevelIssues?: RawAggregateItemIssue[];
};

type RawItemIssue = {
  code?: string;
  severity?: string;
  resolution?: string;
  attribute?: string;
  description?: string;
  detail?: string;
  documentation?: string;
  documentationUri?: string;
  applicableCountries?: string[];
};

type RawProduct = {
  name?: string;
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  title?: string;
  productStatus?: {
    destinationStatuses?: Array<{
      reportingContext?: string;
      approvedCountries?: string[];
      pendingCountries?: string[];
      disapprovedCountries?: string[];
    }>;
    itemLevelIssues?: RawItemIssue[];
  };
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Parse `accounts/{id}/aggregateProductStatuses/{CONTEXT}~{COUNTRY}` → ctx + country. */
export function parseAggregateResourceName(name: string | undefined): {
  reportingContext: string;
  country: string;
} {
  if (!name) return { reportingContext: '', country: '' };
  const leaf = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
  const tilde = leaf.indexOf('~');
  if (tilde <= 0) return { reportingContext: '', country: '' };
  return {
    reportingContext: leaf.slice(0, tilde).trim(),
    country: leaf.slice(tilde + 1).trim().toUpperCase(),
  };
}

function mapAggregateIssues(raw: RawAggregateItemIssue[] | undefined): GmcAggregateIssue[] {
  if (!raw?.length) return [];
  return raw.map((iss) => ({
    code: iss.code ?? '',
    attribute: iss.attribute ?? '',
    severity: iss.severity ?? '',
    productCount: num(iss.productCount),
    detail: iss.detail ?? iss.description ?? '',
    documentationUri: iss.documentationUri ?? iss.documentation ?? '',
  }));
}

export function mapAggregate(a: RawAggregate): GmcAggregateStatus {
  const fromName = parseAggregateResourceName(a.name);
  const stats = a.statistics ?? {};
  const flat: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.stats ?? {})) flat[k] = num(v);
  for (const [k, v] of Object.entries(stats)) {
    if (v != null) flat[k] = num(v);
  }
  const approved =
    num(stats.approvedCount) ||
    num(stats.activeCount) ||
    num(flat.approvedCount) ||
    num(flat.activeCount);
  const pending = num(stats.pendingCount) || num(flat.pendingCount);
  const disapproved = num(stats.disapprovedCount) || num(flat.disapprovedCount);
  const reportingContext = (a.reportingContext ?? fromName.reportingContext ?? '').trim();
  const country = (a.countryCode ?? a.country ?? fromName.country ?? '').trim().toUpperCase();
  return {
    reportingContext,
    country,
    approvedCount: approved,
    pendingCount: pending,
    disapprovedCount: disapproved,
    statistics: flat,
    itemLevelIssues: mapAggregateIssues(a.itemLevelIssues),
  };
}

function extractProductIssues(p: RawProduct): GmcProductIssue[] {
  const issues = p.productStatus?.itemLevelIssues ?? [];
  if (!issues.length) return [];
  const offerId = p.offerId ?? '';
  const title = p.title ?? '';
  const itemId = p.name ?? offerId;
  const dest =
    p.productStatus?.destinationStatuses?.map((d) => d.reportingContext ?? '').filter(Boolean).join(',') ||
    '';
  return issues.map((iss) => ({
    offerId,
    title,
    itemId,
    severity: iss.severity ?? '',
    attribute: iss.attribute ?? '',
    code: iss.code ?? '',
    detail: iss.detail ?? iss.description ?? '',
    destination: dest,
    resolution: iss.resolution ?? '',
    documentationUri: iss.documentationUri ?? iss.documentation ?? '',
  }));
}

function findHeadlineSlice(statuses: GmcAggregateStatus[]): GmcAggregateStatus | undefined {
  return statuses.find(
    (a) =>
      a.reportingContext === GMC_HEADLINE_CONTEXT &&
      a.country.toUpperCase() === GMC_HEADLINE_COUNTRY,
  );
}

export function issueCodesFromAggregate(agg: GmcAggregateStatus | undefined): GmcIssueCode[] {
  if (!agg?.itemLevelIssues?.length) return [];
  const byKey = new Map<string, GmcIssueCode>();
  for (const iss of agg.itemLevelIssues) {
    const code = iss.code || 'unknown';
    const attribute = iss.attribute || '';
    const key = `${code}|${attribute}|${iss.severity || ''}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.productCount += iss.productCount;
    } else {
      byKey.set(key, {
        code,
        attribute,
        severity: iss.severity || '',
        productCount: iss.productCount,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.productCount - a.productCount || a.code.localeCompare(b.code));
}

function emptyDiagnostics(
  merchantId: string | null,
  skipReason: string,
): GmcDiagnosticsBody {
  return {
    ok: true,
    skipped: true,
    skipReason,
    merchantId,
    reportingContext: GMC_HEADLINE_CONTEXT,
    country: GMC_HEADLINE_COUNTRY,
    accountIssues: [],
    aggregateStatuses: [],
    productIssues: [],
    issueCodes: [],
    apiErrors: [],
    summary: {
      accountIssueCount: 0,
      productIssueCount: 0,
      productsScanned: 0,
      productsWithIssues: 0,
      approvedTotal: 0,
      pendingTotal: 0,
      disapprovedTotal: 0,
    },
  };
}

/** Full diagnostics for /ops/gmc-diagnostics and preview summary. */
export async function fetchGmcDiagnostics(env: GmcEnv): Promise<GmcDiagnosticsBody> {
  const merchantId = normalizeMerchantId(env.GOOGLE_MERCHANT_ID ?? '');
  if (!merchantId) {
    console.warn('[MARKETING_INGEST] GMC skip: missing GOOGLE_MERCHANT_ID');
    return emptyDiagnostics(null, 'missing GOOGLE_MERCHANT_ID');
  }
  if (!(env.GOOGLE_MERCHANT_REFRESH_TOKEN ?? '').trim()) {
    console.warn('[MARKETING_INGEST] GMC skip: missing GOOGLE_MERCHANT_REFRESH_TOKEN');
    return emptyDiagnostics(merchantId, 'missing GOOGLE_MERCHANT_REFRESH_TOKEN');
  }
  if (
    !(env.GOOGLE_MERCHANT_CLIENT_ID ?? '').trim() ||
    !(env.GOOGLE_MERCHANT_CLIENT_SECRET ?? '').trim()
  ) {
    console.warn('[MARKETING_INGEST] GMC skip: missing GOOGLE_MERCHANT_CLIENT_ID or GOOGLE_MERCHANT_CLIENT_SECRET');
    return emptyDiagnostics(merchantId, 'missing GOOGLE_MERCHANT_CLIENT_ID or GOOGLE_MERCHANT_CLIENT_SECRET');
  }

  const access = await refreshMerchantAccessToken(env);
  if (!access) {
    console.error('[MARKETING_INGEST] GMC skip: access-token refresh failed (need scope', CONTENT_SCOPE_HINT, ')');
    return emptyDiagnostics(merchantId, 'token_refresh_failed');
  }

  const parent = `accounts/${merchantId}`;
  const accountIssues: GmcAccountIssue[] = [];
  const aggregateStatuses: GmcAggregateStatus[] = [];
  const productIssues: GmcProductIssue[] = [];
  const apiErrors: Array<{ endpoint: string; status: number; message: string }> = [];
  let productsScanned = 0;
  let productsWithIssues = 0;

  const issuesUrl =
    `https://merchantapi.googleapis.com/accounts/v1/${parent}/issues` +
    `?languageCode=pl-PL&pageSize=100`;
  const issuesRes = await merchantGet<{ accountIssues?: RawAccountIssue[]; issues?: RawAccountIssue[] }>(
    access,
    issuesUrl,
  );
  if (issuesRes.ok) {
    const list = issuesRes.data.accountIssues ?? issuesRes.data.issues ?? [];
    for (const iss of list) {
      accountIssues.push({
        name: iss.name ?? '',
        title: iss.title ?? '',
        severity: iss.severity ?? '',
        detail: iss.detail ?? '',
        documentationUri: iss.documentationUri ?? '',
      });
    }
  } else {
    apiErrors.push({ endpoint: 'accounts.issues', status: issuesRes.status, message: issuesRes.body });
    console.error('[MARKETING_INGEST] GMC accounts.issues HTTP', {
      status: issuesRes.status,
      body: issuesRes.body,
    });
  }

  let aggPageToken = '';
  for (let page = 0; page < MAX_AGGREGATE_PAGES; page++) {
    const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (aggPageToken) qs.set('pageToken', aggPageToken);
    const aggUrl =
      `https://merchantapi.googleapis.com/issueresolution/v1/${parent}/aggregateProductStatuses?${qs}`;
    const aggRes = await merchantGet<{
      aggregateProductStatuses?: RawAggregate[];
      nextPageToken?: string;
    }>(access, aggUrl);
    if (!aggRes.ok) {
      apiErrors.push({
        endpoint: 'aggregateProductStatuses',
        status: aggRes.status,
        message: aggRes.body,
      });
      console.error('[MARKETING_INGEST] GMC aggregateProductStatuses HTTP', {
        status: aggRes.status,
        body: aggRes.body,
        page,
      });
      break;
    }
    for (const a of aggRes.data.aggregateProductStatuses ?? []) {
      aggregateStatuses.push(mapAggregate(a));
    }
    aggPageToken = aggRes.data.nextPageToken ?? '';
    if (!aggPageToken) break;
  }

  let pageToken = '';
  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) qs.set('pageToken', pageToken);
    const productsUrl = `https://merchantapi.googleapis.com/products/v1/${parent}/products?${qs}`;
    const prodRes = await merchantGet<{
      products?: RawProduct[];
      nextPageToken?: string;
    }>(access, productsUrl);
    if (!prodRes.ok) {
      apiErrors.push({
        endpoint: 'products.list',
        status: prodRes.status,
        message: prodRes.body,
      });
      console.error('[MARKETING_INGEST] GMC products.list HTTP', {
        status: prodRes.status,
        body: prodRes.body,
        page,
      });
      break;
    }
    const products = prodRes.data.products ?? [];
    productsScanned += products.length;
    for (const p of products) {
      const extracted = extractProductIssues(p);
      if (!extracted.length) continue;
      productsWithIssues += 1;
      for (const iss of extracted) {
        if (productIssues.length < TOP_PRODUCT_ISSUES) productIssues.push(iss);
      }
    }
    pageToken = prodRes.data.nextPageToken ?? '';
    if (!pageToken) break;
  }

  const headline = findHeadlineSlice(aggregateStatuses);
  const approvedTotal = headline?.approvedCount ?? 0;
  const pendingTotal = headline?.pendingCount ?? 0;
  const disapprovedTotal = headline?.disapprovedCount ?? 0;
  const issueCodes = issueCodesFromAggregate(headline);

  console.log('[MARKETING_INGEST] GMC diagnostics', {
    merchantId,
    headlineContext: GMC_HEADLINE_CONTEXT,
    headlineCountry: GMC_HEADLINE_COUNTRY,
    approvedTotal,
    pendingTotal,
    disapprovedTotal,
    issueCodeCount: issueCodes.length,
    accountIssues: accountIssues.length,
    aggregates: aggregateStatuses.length,
    productsScanned,
    productsWithIssues,
    productIssuesReturned: productIssues.length,
  });

  return {
    ok: true,
    skipped: false,
    merchantId,
    reportingContext: GMC_HEADLINE_CONTEXT,
    country: GMC_HEADLINE_COUNTRY,
    accountIssues,
    aggregateStatuses,
    productIssues,
    issueCodes,
    apiErrors,
    summary: {
      accountIssueCount: accountIssues.length,
      productIssueCount: productIssues.length,
      productsScanned,
      productsWithIssues,
      approvedTotal,
      pendingTotal,
      disapprovedTotal,
    },
  };
}

/** Compact summary for marketing-preview / RPC. */
export async function fetchGmcPreviewSummary(env: GmcEnv): Promise<{
  skipped: boolean;
  skipReason?: string;
  merchantId: string | null;
  reportingContext: string;
  country: string;
  accountIssueCount: number;
  productsScanned: number;
  productsWithIssues: number;
  approvedTotal: number;
  pendingTotal: number;
  disapprovedTotal: number;
  issueCodes: GmcIssueCode[];
  topAccountIssues: Array<{ title: string; severity: string }>;
  topProductIssues: Array<{
    offerId: string;
    title: string;
    severity: string;
    attribute: string;
    code: string;
  }>;
}> {
  const d = await fetchGmcDiagnostics(env);
  return {
    skipped: Boolean(d.skipped),
    skipReason: d.skipReason,
    merchantId: d.merchantId,
    reportingContext: d.reportingContext,
    country: d.country,
    accountIssueCount: d.summary.accountIssueCount,
    productsScanned: d.summary.productsScanned,
    productsWithIssues: d.summary.productsWithIssues,
    approvedTotal: d.summary.approvedTotal,
    pendingTotal: d.summary.pendingTotal,
    disapprovedTotal: d.summary.disapprovedTotal,
    issueCodes: d.issueCodes,
    topAccountIssues: d.accountIssues.slice(0, 10).map((i) => ({
      title: i.title,
      severity: i.severity,
    })),
    topProductIssues: d.productIssues.slice(0, 15).map((i) => ({
      offerId: i.offerId,
      title: i.title,
      severity: i.severity,
      attribute: i.attribute,
      code: i.code,
    })),
  };
}
