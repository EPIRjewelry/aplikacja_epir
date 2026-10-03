import {describe, expect, it} from 'vitest';
import {buildUcpAgentProfileJson} from '../src/catalog/ucp-agent-profile';
import {resolveUcpAgentProfileUrl} from '../src/catalog/ucp-agent-meta';

const PROFILE_URL = 'https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json';

describe('buildUcpAgentProfileJson', () => {
  it('keeps identity and declares UCP 2026-08-25 for storefront catalog', () => {
    const profile = buildUcpAgentProfileJson({
      WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl/',
      SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    });

    expect(profile.name).toBe('EPIR Gemma');
    expect(profile.description).toBe(
      'Luxury jewelry assistant for EPIR Art Jewellery storefronts.',
    );
    expect(profile.url).toBe('https://asystent.epirbizuteria.pl');
    expect(profile.merchant).toEqual({shop_domain: 'epir-art-silver-jewellery.myshopify.com'});
    expect(profile).not.toHaveProperty('version');
    expect(profile).not.toHaveProperty('capabilities');

    const ucp = profile.ucp as {
      version: string;
      services: Record<string, Array<{version: string; transport: string}>>;
      capabilities: Record<string, Array<{version: string; extends?: string[]}>>;
      payment_handlers: Record<string, unknown>;
    };
    expect(ucp.version).toBe('2026-08-25');
    expect(ucp.services['dev.ucp.shopping'][0]).toMatchObject({
      version: '2026-08-25',
      transport: 'mcp',
    });
    expect(ucp.payment_handlers).toEqual({});

    const caps = ucp.capabilities;
    for (const name of [
      'dev.ucp.shopping.catalog.search',
      'dev.ucp.shopping.catalog.lookup',
      'dev.shopify.catalog',
      'dev.ucp.shopping.cart',
      'dev.ucp.shopping.checkout',
    ]) {
      expect(caps[name][0].version).toBe('2026-08-25');
    }
    expect(caps['dev.shopify.catalog'][0].extends).toEqual([
      'dev.ucp.shopping.catalog.lookup',
      'dev.ucp.shopping.catalog.search',
    ]);
    expect(caps).not.toHaveProperty('dev.shopify.catalog.global');
    expect(caps).not.toHaveProperty('dev.ucp.shopping.fulfillment');
    expect(caps).not.toHaveProperty('dev.ucp.shopping.order');
  });

  it('falls back to the assistant origin and the merchant shop domain', () => {
    const profile = buildUcpAgentProfileJson({});
    expect(profile.url).toBe('https://asystent.epirbizuteria.pl');
    expect(profile.merchant).toEqual({shop_domain: 'epir-art-silver-jewellery.myshopify.com'});
  });
});

describe('resolveUcpAgentProfileUrl', () => {
  it('keeps the worker well-known profile URL', () => {
    expect(resolveUcpAgentProfileUrl({WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl'})).toBe(
      PROFILE_URL,
    );
  });
});
