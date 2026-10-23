import {beforeEach, describe, expect, it, vi} from 'vitest';
import {executeCatalogMcpLiveSearch} from '../../src/facts/catalog-mcp-live';
import * as mcpServer from '../../src/mcp_server';
import * as storefrontLive from '../../src/facts/storefront-live';
import {moneyFromMinor} from '../../src/facts/types';
import {fictionalMultiVariantProduct} from '../gemma-v2/fixtures/fictional-catalog-products';

describe('catalog MCP hydrate — handle fallback', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-UCP-HYDRATE-HANDLE-1: null nodes + fail product(id:) → facts by UCP handle', async () => {
    vi.spyOn(storefrontLive, 'hasStorefrontCatalogToken').mockReturnValue(true);
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              products: [
                {
                  id: 'gid://shopify/Product/target-ring',
                  handle: 'pierscionek-srebrny-z-granatem',
                },
              ],
            }),
          },
        ],
      },
    });

    const target = {
      ...fictionalMultiVariantProduct(),
      productId: 'gid://shopify/Product/target-ring',
      handle: 'pierscionek-srebrny-z-granatem',
      productType: 'Pierścionek',
      stones: ['Granat'],
      variants: [
        {
          ...fictionalMultiVariantProduct().variants[0],
          metal: 'srebro 925',
          price: moneyFromMinor(34_000),
        },
      ],
    };

    vi.spyOn(storefrontLive, 'fetchProductFactsLive').mockImplementation(
      async (_env, _channel, ids, options) => {
        expect(ids).toEqual(['gid://shopify/Product/target-ring']);
        expect(options?.productHandlesById?.['gid://shopify/Product/target-ring']).toBe(
          'pierscionek-srebrny-z-granatem',
        );
        // Simulate handle path recovering the target.
        return [target];
      },
    );

    const result = await executeCatalogMcpLiveSearch(
      {PRIVATE_STOREFRONT_API_TOKEN: 'tok'} as never,
      'epir-online-store',
      {text: 'pierścionek srebro granat'},
      10,
      {throwOnMcpError: true},
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].product.handle).toBe('pierscionek-srebrny-z-granatem');
  });
});
