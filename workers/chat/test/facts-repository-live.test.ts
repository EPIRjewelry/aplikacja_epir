import {describe, expect, it, vi, afterEach} from 'vitest';
import {getCatalogRepository} from '../src/facts/index';
import * as mcpServer from '../src/mcp_server';
import type {Env} from '../src/config/bindings';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getCatalogRepository live search', () => {
  it('UCP returns 2 ids, Storefront returns 1 product + null → 1 match', async () => {
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              products: [
                {id: 'gid://shopify/Product/1'},
                {id: 'gid://shopify/Product/2'},
              ],
            }),
          },
        ],
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            nodes: [
              {
                id: 'gid://shopify/Product/1',
                handle: 'one',
                title: 'One',
                productType: 'Ring',
                collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
                metafields: {nodes: []},
                variants: {
                  pageInfo: {hasNextPage: false, endCursor: null},
                  nodes: [
                    {
                      id: 'gid://shopify/ProductVariant/1',
                      price: {amount: '10.00', currencyCode: 'PLN'},
                      availableForSale: true,
                      selectedOptions: [],
                      metafields: {nodes: []},
                    },
                  ],
                },
              },
              null,
            ],
          },
        }),
        {status: 200},
      ),
    );

    const repo = await getCatalogRepository(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
    );
    const {matches, total} = await repo.search({text: 'ring'}, 10);
    expect(total).toBe(1);
    expect(matches).toHaveLength(1);
    expect(matches[0].product.handle).toBe('one');
  });
});
