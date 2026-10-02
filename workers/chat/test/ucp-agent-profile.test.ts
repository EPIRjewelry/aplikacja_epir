import {describe, expect, it} from 'vitest';
import {buildUcpAgentProfileJson} from '../src/catalog/ucp-agent-profile';
import {resolveUcpAgentProfileUrl} from '../src/catalog/ucp-agent-meta';

describe('UCP agent profile', () => {
  it('does not point search_catalog at the malformed worker well-known profile', () => {
    expect(
      resolveUcpAgentProfileUrl({
        WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
      }),
    ).toBe('https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json');
  });

  it('serves a negotiable catalog profile from the well-known route', () => {
    const profile = buildUcpAgentProfileJson({
      WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
      SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    });
    const ucp = profile.ucp as {
      version?: string;
      capabilities?: Record<string, unknown>;
    };
    expect(ucp.version).toBe('2026-08-25');
    expect(ucp.capabilities?.['dev.ucp.shopping.catalog.search']).toBeTruthy();
    expect(ucp.capabilities?.['dev.shopify.catalog']).toBeTruthy();
    expect(profile).not.toHaveProperty('capabilities');
  });
});
