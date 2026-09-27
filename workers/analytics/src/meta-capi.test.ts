import { describe, expect, it, vi } from 'vitest';
import {
  extractContentIdsFromOrder,
  extractOrderNumericId,
  extractPurchaseTotals,
  isLikelyKazkaOrder,
  purchaseEventId,
  sendMetaCapiPurchase,
} from './meta-capi';

describe('meta-capi', () => {
  it('builds stable purchase event_id', () => {
    expect(purchaseEventId('555001')).toBe('purchase_555001');
  });

  it('detects Kazka from cart attribute (primary)', () => {
    expect(
      isLikelyKazkaOrder({
        note_attributes: [{ name: '_epir_storefront', value: 'kazka' }],
      }),
    ).toBe(true);
    expect(
      isLikelyKazkaOrder({
        custom_attributes: [{ key: '_epir_storefront', value: 'zareczyny' }],
      }),
    ).toBe(false);
    expect(isLikelyKazkaOrder({ landing_site: 'https://epirbizuteria.pl/' })).toBe(false);
  });

  it('falls back to landing_site when attribute missing', () => {
    expect(
      isLikelyKazkaOrder({ landing_site: 'https://kazka.epirbizuteria.pl/products/foo' }),
    ).toBe(true);
  });

  it('prefers Variant SKU over handle for content_ids', () => {
    const ids = extractContentIdsFromOrder({
      line_items: [
        { sku: '104-10692 S-14-karatow-gemstone', handle: '104-10692-s' },
        { product_url: 'https://kazka.epirbizuteria.pl/products/ring-b' },
      ],
    });
    expect(ids).toEqual(['104-10692 S-14-karatow-gemstone', 'ring-b']);
  });

  it('parses order id and totals', () => {
    const order = {
      id: 99,
      admin_graphql_api_id: 'gid://shopify/Order/99',
      total_price: '1200.00',
      currency: 'PLN',
    };
    expect(extractOrderNumericId(order)).toBe('99');
    expect(extractPurchaseTotals(order)).toEqual({ value: 1200, currency: 'PLN' });
  });

  it('skips CAPI when token missing', async () => {
    const result = await sendMetaCapiPurchase(
      {},
      {
        orderGid: 'gid://shopify/Order/1',
        orderNumericId: '1',
        contentIds: ['foo'],
        value: 10,
        currency: 'PLN',
        eventTimeSec: 1_700_000_000,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.skipped).toContain('META_CAPI_ACCESS_TOKEN');
  });

  it('posts to Graph API when token set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"events_received":1}',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMetaCapiPurchase(
      { META_CAPI_ACCESS_TOKEN: 'test-token' },
      {
        orderGid: 'gid://shopify/Order/42',
        orderNumericId: '42',
        contentIds: ['kazka-ring'],
        value: 499,
        currency: 'PLN',
        eventTimeSec: 1_700_000_000,
        email: 'buyer@example.com',
      },
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/1320796521913985/events');
    const body = JSON.parse(String(init.body));
    expect(body.data[0].event_id).toBe('purchase_42');
    expect(body.data[0].custom_data.content_ids).toEqual(['kazka-ring']);
    expect(body.data[0].user_data.em).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});
