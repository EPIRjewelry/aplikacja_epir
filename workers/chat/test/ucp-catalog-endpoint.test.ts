import {describe, expect, it} from 'vitest';
import {
  getUcpCatalogEndpoint,
  mapGemmaToolToUcpMcp,
  UCP_CATALOG_TOOL_NAMES,
} from '../src/catalog/ucp-catalog-endpoint';

describe('getUcpCatalogEndpoint', () => {
  it('uses explicit env override', () => {
    expect(
      getUcpCatalogEndpoint({
        UCP_CATALOG_ENDPOINT: 'https://custom.example/api/ucp/mcp',
        SHOP_DOMAIN: 'ignored.myshopify.com',
      }),
    ).toBe('https://custom.example/api/ucp/mcp');
  });

  it('derives from SHOP_DOMAIN', () => {
    expect(getUcpCatalogEndpoint({SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com'})).toBe(
      'https://epir-art-silver-jewellery.myshopify.com/api/ucp/mcp',
    );
  });

  it('returns empty when shop missing', () => {
    expect(getUcpCatalogEndpoint({})).toBe('');
  });
});

describe('mapGemmaToolToUcpMcp', () => {
  it('maps catalog_* tools to UCP MCP names', () => {
    expect(mapGemmaToolToUcpMcp('catalog_search')).toBe('search_catalog');
    expect(mapGemmaToolToUcpMcp('catalog_image_search')).toBe('search_catalog');
    expect(mapGemmaToolToUcpMcp('catalog_lookup')).toBe('lookup_catalog');
    expect(mapGemmaToolToUcpMcp('update_cart')).toBe('update_cart');
  });

  it('lists discovery tools', () => {
    expect(UCP_CATALOG_TOOL_NAMES.has('catalog_search')).toBe(true);
    expect(UCP_CATALOG_TOOL_NAMES.has('update_cart')).toBe(false);
  });
});
