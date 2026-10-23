import {describe, expect, it} from 'vitest';
import {
  extractHandleFromUcpProduct,
  parseUcpSearchProductIds,
  parseUcpSearchProductRefs,
} from '../../src/facts/catalog-mcp-live';

describe('parseUcpSearchProductRefs', () => {
  it('T-UCP-REF-1: keeps id + handle from UCP products', () => {
    const mcpOut = {
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              products: [
                {
                  id: 'gid://shopify/Product/1',
                  handle: 'pierscionek-srebrny-z-granatem',
                },
                {
                  id: 'gid://shopify/Product/2',
                  url: 'https://epirbizuteria.pl/products/galazki-z-granatem',
                },
              ],
            }),
          },
        ],
      },
    };
    const refs = parseUcpSearchProductRefs(mcpOut);
    expect(refs).toEqual([
      {id: 'gid://shopify/Product/1', handle: 'pierscionek-srebrny-z-granatem'},
      {id: 'gid://shopify/Product/2', handle: 'galazki-z-granatem'},
    ]);
    expect(parseUcpSearchProductIds(mcpOut)).toEqual([
      'gid://shopify/Product/1',
      'gid://shopify/Product/2',
    ]);
  });

  it('T-UCP-REF-2: extractHandleFromUcpProduct from onlineStoreUrl', () => {
    expect(
      extractHandleFromUcpProduct({
        onlineStoreUrl: 'https://epirbizuteria.pl/products/pierscionek-srebrny-z-granatem?x=1',
      }),
    ).toBe('pierscionek-srebrny-z-granatem');
  });
});
