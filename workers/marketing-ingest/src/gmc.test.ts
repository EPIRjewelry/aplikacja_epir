import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGmcDiagnostics,
  fetchGmcPreviewSummary,
  issueCodesFromAggregate,
  mapAggregate,
  parseAggregateResourceName,
} from './gmc';
import { buildGmcSnapshotRecords } from './gmc-snapshot';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseAggregateResourceName / mapAggregate', () => {
  it('parses CONTEXT~COUNTRY from resource name', () => {
    expect(
      parseAggregateResourceName('accounts/1/aggregateProductStatuses/SHOPPING_ADS~PL'),
    ).toEqual({ reportingContext: 'SHOPPING_ADS', country: 'PL' });
  });

  it('fills context/country from name when fields missing; reads stats + itemLevelIssues', () => {
    const mapped = mapAggregate({
      name: 'accounts/1/aggregateProductStatuses/SHOPPING_ADS~PL',
      stats: { approvedCount: 3172, pendingCount: 1, disapprovedCount: 62 },
      itemLevelIssues: [
        {
          code: 'missing_item_attribute_for_product_type',
          attribute: 'color',
          severity: 'DEMOTED',
          productCount: 400,
        },
      ],
    });
    expect(mapped.reportingContext).toBe('SHOPPING_ADS');
    expect(mapped.country).toBe('PL');
    expect(mapped.approvedCount).toBe(3172);
    expect(mapped.itemLevelIssues[0]?.productCount).toBe(400);
  });
});

describe('issueCodesFromAggregate', () => {
  it('sorts by productCount descending', () => {
    const codes = issueCodesFromAggregate({
      reportingContext: 'SHOPPING_ADS',
      country: 'PL',
      approvedCount: 1,
      pendingCount: 0,
      disapprovedCount: 0,
      statistics: {},
      itemLevelIssues: [
        { code: 'a', attribute: 'x', severity: 'E', productCount: 2, detail: '', documentationUri: '' },
        { code: 'b', attribute: 'y', severity: 'E', productCount: 10, detail: '', documentationUri: '' },
      ],
    });
    expect(codes.map((c) => c.code)).toEqual(['b', 'a']);
  });
});

describe('fetchGmcDiagnostics', () => {
  it('skips when merchant id missing', async () => {
    const d = await fetchGmcDiagnostics({});
    expect(d.skipped).toBe(true);
    expect(d.skipReason).toMatch(/GOOGLE_MERCHANT_ID/);
    expect(d.summary.accountIssueCount).toBe(0);
  });

  it('skips when refresh token missing', async () => {
    const d = await fetchGmcDiagnostics({ GOOGLE_MERCHANT_ID: '123456789' });
    expect(d.skipped).toBe(true);
    expect(d.skipReason).toMatch(/REFRESH_TOKEN/);
  });

  it('headline is SHOPPING_ADS+PL only; issueCodes from aggregate not product samples', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      }
      if (url.includes('/issues')) {
        return new Response(
          JSON.stringify({
            accountIssues: [
              {
                name: 'accounts/1/issues/x',
                title: 'Account warning',
                severity: 'WARNING',
                detail: 'Fix me',
                documentationUri: 'https://example.com',
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('aggregateProductStatuses')) {
        return new Response(
          JSON.stringify({
            aggregateProductStatuses: [
              {
                name: 'accounts/1/aggregateProductStatuses/FREE_LOCAL_LISTINGS~PL',
                reportingContext: 'FREE_LOCAL_LISTINGS',
                country: 'PL',
                statistics: {
                  approvedCount: 1490,
                  pendingCount: 0,
                  disapprovedCount: 1303,
                },
              },
              {
                name: 'accounts/1/aggregateProductStatuses/SHOPPING_ADS~SK',
                reportingContext: 'SHOPPING_ADS',
                country: 'SK',
                statistics: {
                  approvedCount: 1397,
                  pendingCount: 0,
                  disapprovedCount: 1305,
                },
              },
              {
                name: 'accounts/1/aggregateProductStatuses/SHOPPING_ADS~PL',
                reportingContext: 'SHOPPING_ADS',
                country: 'PL',
                statistics: {
                  approvedCount: 3172,
                  pendingCount: 1,
                  disapprovedCount: 62,
                },
                itemLevelIssues: [
                  {
                    code: 'missing_item_attribute_for_product_type',
                    attribute: 'color',
                    severity: 'DEMOTED',
                    productCount: 400,
                  },
                  {
                    code: 'missing_shipping_weight',
                    attribute: 'shipping_weight',
                    severity: 'DEMOTED',
                    productCount: 12,
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/products')) {
        return new Response(
          JSON.stringify({
            products: [
              {
                offerId: 'sku-1',
                title: 'Ring',
                name: 'accounts/1/products/online~pl~sku-1',
                productStatus: {
                  destinationStatuses: [{ reportingContext: 'SHOPPING_ADS' }],
                  itemLevelIssues: [
                    {
                      code: 'missing_image',
                      severity: 'ERROR',
                      attribute: 'image_link',
                      detail: 'No image',
                      documentationUri: 'https://example.com/img',
                    },
                  ],
                },
              },
              {
                offerId: 'sku-ok',
                title: 'OK',
                productStatus: { itemLevelIssues: [] },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('unexpected', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const d = await fetchGmcDiagnostics({
      GOOGLE_MERCHANT_CLIENT_ID: 'cid',
      GOOGLE_MERCHANT_CLIENT_SECRET: 'sec',
      GOOGLE_MERCHANT_REFRESH_TOKEN: 'rt',
      GOOGLE_MERCHANT_ID: 'accounts/999',
    });

    expect(d.skipped).toBe(false);
    expect(d.merchantId).toBe('999');
    expect(d.reportingContext).toBe('SHOPPING_ADS');
    expect(d.country).toBe('PL');
    expect(d.accountIssues).toHaveLength(1);
    expect(d.aggregateStatuses).toHaveLength(3);
    // Must NOT sum world (3172+1397+1490)
    expect(d.summary.approvedTotal).toBe(3172);
    expect(d.summary.pendingTotal).toBe(1);
    expect(d.summary.disapprovedTotal).toBe(62);
    expect(d.productIssues[0]?.offerId).toBe('sku-1');
    expect(d.summary.productsScanned).toBe(2);
    expect(d.summary.productsWithIssues).toBe(1);
    // Full codes from PL Shopping aggregate — not the products.list sample code
    expect(d.issueCodes.map((c) => c.code)).toEqual([
      'missing_item_attribute_for_product_type',
      'missing_shipping_weight',
    ]);
    expect(d.issueCodes[0]?.productCount).toBe(400);
    expect(d.issueCodes.some((c) => c.code === 'missing_image')).toBe(false);

    const summary = await fetchGmcPreviewSummary({
      GOOGLE_MERCHANT_CLIENT_ID: 'cid',
      GOOGLE_MERCHANT_CLIENT_SECRET: 'sec',
      GOOGLE_MERCHANT_REFRESH_TOKEN: 'rt',
      GOOGLE_MERCHANT_ID: '999',
    });
    expect(summary.approvedTotal).toBe(3172);
    expect(summary.disapprovedTotal).toBe(62);
    expect(summary.issueCodes[0]?.code).toBe('missing_item_attribute_for_product_type');
    expect(summary.topProductIssues[0]?.code).toBe('missing_image');
    expect(summary.reportingContext).toBe('SHOPPING_ADS');
    expect(summary.country).toBe('PL');
  });
});

describe('buildGmcSnapshotRecords', () => {
  it('returns empty when skipped', async () => {
    const rows = await buildGmcSnapshotRecords({}, '2026-08-11');
    expect(rows).toEqual([]);
  });

  it('builds google_merchant snapshot with SHOPPING_ADS+PL headline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('oauth2')) {
          return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
        }
        if (url.includes('/issues')) {
          return new Response(JSON.stringify({ accountIssues: [] }), { status: 200 });
        }
        if (url.includes('aggregateProductStatuses')) {
          return new Response(
            JSON.stringify({
              aggregateProductStatuses: [
                {
                  name: 'accounts/42/aggregateProductStatuses/SHOPPING_ADS~DE',
                  reportingContext: 'SHOPPING_ADS',
                  country: 'DE',
                  statistics: { approvedCount: 100, pendingCount: 0, disapprovedCount: 50 },
                },
                {
                  name: 'accounts/42/aggregateProductStatuses/SHOPPING_ADS~PL',
                  reportingContext: 'SHOPPING_ADS',
                  country: 'PL',
                  statistics: { approvedCount: 5, pendingCount: 0, disapprovedCount: 1 },
                  itemLevelIssues: [
                    { code: 'price_updated', attribute: 'price', severity: 'NOT_IMPACTED', productCount: 3 },
                  ],
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/products')) {
          return new Response(JSON.stringify({ products: [] }), { status: 200 });
        }
        return new Response('no', { status: 404 });
      }),
    );

    const rows = await buildGmcSnapshotRecords(
      {
        GOOGLE_MERCHANT_CLIENT_ID: 'c',
        GOOGLE_MERCHANT_CLIENT_SECRET: 's',
        GOOGLE_MERCHANT_REFRESH_TOKEN: 'r',
        GOOGLE_MERCHANT_ID: '42',
      },
      '2026-08-11',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe('google_merchant');
    expect(rows[0]?.date).toBe('2026-08-11');
    expect(rows[0]?.reporting_context).toBe('SHOPPING_ADS');
    expect(rows[0]?.country).toBe('PL');
    expect(rows[0]?.approved_total).toBe(5);
    expect(rows[0]?.disapproved_total).toBe(1);
    expect(JSON.parse(rows[0]!.issue_codes_json)[0]?.code).toBe('price_updated');
    expect(() => JSON.parse(rows[0]!.aggregate_statuses_json)).not.toThrow();
  });
});
