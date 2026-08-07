import {describe, expect, it} from 'vitest';
import {
  hasUtmParams,
  parseCampaignMapping,
  parseProductIdsField,
  resolveCampaignHandleFromUrl,
} from '../src/campaign';
import {shouldTransformPath, shouldTransformRequest} from '../src/paths';

const MAPPING = {
  kazka_b2b: 'b2b-landing',
  kazka_wiecznosc: 'wiecznosc-landing',
  default: 'default-landing',
};

describe('hasUtmParams', () => {
  it('returns true when utm_campaign is present', () => {
    expect(hasUtmParams('https://epirbizuteria.pl/?utm_campaign=kazka_b2b')).toBe(
      true,
    );
  });

  it('returns false without utm params', () => {
    expect(hasUtmParams('https://epirbizuteria.pl/')).toBe(false);
  });
});

describe('parseCampaignMapping', () => {
  it('parses object with string values', () => {
    expect(parseCampaignMapping({kazka_b2b: 'b2b-landing', default: 'x'})).toEqual({
      kazka_b2b: 'b2b-landing',
      default: 'x',
    });
  });

  it('returns empty object for invalid input', () => {
    expect(parseCampaignMapping(null)).toEqual({});
    expect(parseCampaignMapping([])).toEqual({});
  });
});

describe('parseProductIdsField', () => {
  it('parses JSON array of GIDs', () => {
    const ids = ['gid://shopify/Product/1', 'gid://shopify/Product/2'];
    expect(parseProductIdsField(JSON.stringify(ids))).toEqual(ids);
  });

  it('treats single value as one-item list', () => {
    expect(parseProductIdsField('gid://shopify/Product/99')).toEqual([
      'gid://shopify/Product/99',
    ]);
  });

  it('returns empty array for blank value', () => {
    expect(parseProductIdsField('')).toEqual([]);
  });
});

describe('resolveCampaignHandleFromUrl', () => {
  it('maps utm_campaign to landing handle', () => {
    const url = 'https://epirbizuteria.pl/?utm_campaign=kazka_b2b';
    expect(resolveCampaignHandleFromUrl(url, MAPPING)).toBe('b2b-landing');
  });

  it('does not use default when allowDefault is false', () => {
    const url = 'https://epirbizuteria.pl/';
    expect(resolveCampaignHandleFromUrl(url, MAPPING, {allowDefault: false})).toBe(
      null,
    );
  });

  it('returns null for unknown utm_campaign', () => {
    const url = 'https://epirbizuteria.pl/?utm_campaign=unknown';
    expect(resolveCampaignHandleFromUrl(url, MAPPING, {allowDefault: false})).toBe(
      null,
    );
  });
});

describe('shouldTransformPath', () => {
  it('allows homepage and catalog paths', () => {
    expect(shouldTransformPath('/')).toBe(true);
    expect(shouldTransformPath('/collections/rings')).toBe(true);
    expect(shouldTransformPath('/products/foo')).toBe(true);
    expect(shouldTransformPath('/pages/about')).toBe(true);
  });

  it('blocks checkout cart apps and account', () => {
    expect(shouldTransformPath('/checkout')).toBe(false);
    expect(shouldTransformPath('/checkouts/abc')).toBe(false);
    expect(shouldTransformPath('/cart')).toBe(false);
    expect(shouldTransformPath('/apps/assistant/chat')).toBe(false);
    expect(shouldTransformPath('/account/login')).toBe(false);
  });
});

describe('shouldTransformRequest', () => {
  it('rejects non-GET methods', () => {
    const url = new URL('https://epirbizuteria.pl/');
    const post = new Request(url, {method: 'POST'});
    expect(shouldTransformRequest(post, url)).toBe(false);
  });
});
