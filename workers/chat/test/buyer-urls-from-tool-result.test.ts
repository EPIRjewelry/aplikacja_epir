import {describe, expect, it} from 'vitest';
import {collectAllowedUrls, foreignHostsInReply} from '../src/buyer/reply-link-guard';
import {urlsFromToolResult} from '../src/buyer/urls-from-tool-result';

describe('urlsFromToolResult', () => {
  it('extracts policy source URLs', () => {
    const urls = urlsFromToolResult(
      'search_shop_policies_and_faqs',
      JSON.stringify({
        answer: 'Zwroty w 14 dni.',
        sources: [{url: 'https://epirbizuteria.pl/policies/refund-policy', title: 'Zwroty'}],
      }),
    );
    expect(urls).toContain('https://epirbizuteria.pl/policies/refund-policy');
  });

  it('extracts continue_url from nested cart payload', () => {
    const urls = urlsFromToolResult(
      'get_cart',
      JSON.stringify({
        structuredContent: {
          cart: {
            id: 'gid://shopify/Cart/1',
            continue_url: 'https://zareczyny.epirbizuteria.pl/cart/c/abc',
            line_items: [],
          },
        },
      }),
    );
    expect(urls).toContain('https://zareczyny.epirbizuteria.pl/cart/c/abc');
  });

  it('allows policy link in reply when source URL is on allowlist', () => {
    const policyUrl = 'https://epirbizuteria.pl/policies/refund-policy';
    const allowed = collectAllowedUrls(
      urlsFromToolResult(
        'search_shop_policies_and_faqs',
        JSON.stringify({answer: 'ok', sources: [{url: policyUrl}]}),
      ),
    );
    const foreign = foreignHostsInReply(
      `Szczegóły: [polityka zwrotów](${policyUrl}).`,
      allowed,
    );
    expect(foreign).toEqual([]);
  });

  it('resolves relative KB markdown path against channel origin', () => {
    const urls = urlsFromToolResult(
      'search_shop_policies_and_faqs',
      JSON.stringify({
        answer: 'Zobacz [formularz](/pages/zaprojektuj-swoj-model).',
        sources: [],
      }),
      'epir-online-store',
    );
    expect(urls).toContain('https://epirbizuteria.pl/pages/zaprojektuj-swoj-model');
  });
});
