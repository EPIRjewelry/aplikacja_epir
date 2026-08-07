import {describe, expect, it} from 'vitest';
import {
  hasUtmParams,
  parseCampaignMapping,
  parseProductIdsField,
  resolveCampaignHandleFromUrl,
  resolveCampaignRedirect,
} from './campaign-landing.server';

const MAPPING = {
  kazka_b2b: 'b2b-landing',
  kazka_wiecznosc: 'wiecznosc-landing',
  default: 'default-landing',
};

describe('hasUtmParams', () => {
  it('returns true when utm_campaign is present', () => {
    expect(hasUtmParams('https://kazka.epirbizuteria.pl/?utm_campaign=kazka_b2b')).toBe(
      true,
    );
  });

  it('returns false without utm params', () => {
    expect(hasUtmParams('https://kazka.epirbizuteria.pl/')).toBe(false);
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
    const url = 'https://kazka.epirbizuteria.pl/p?utm_campaign=kazka_b2b';
    expect(resolveCampaignHandleFromUrl(url, MAPPING)).toBe('b2b-landing');
  });

  it('uses default when no utm and allowDefault is true', () => {
    const url = 'https://kazka.epirbizuteria.pl/p';
    expect(resolveCampaignHandleFromUrl(url, MAPPING, {allowDefault: true})).toBe(
      'default-landing',
    );
  });

  it('does not use default when allowDefault is false', () => {
    const url = 'https://kazka.epirbizuteria.pl/';
    expect(resolveCampaignHandleFromUrl(url, MAPPING, {allowDefault: false})).toBe(
      null,
    );
  });

  it('returns null for empty mapping without match', () => {
    const url = 'https://kazka.epirbizuteria.pl/p?utm_campaign=unknown';
    expect(resolveCampaignHandleFromUrl(url, {}, {allowDefault: true})).toBe(null);
  });
});

describe('resolveCampaignRedirect', () => {
  it('returns /p/{handle} for homepage UTM match', () => {
    const url = 'https://kazka.epirbizuteria.pl/?utm_campaign=kazka_b2b';
    expect(resolveCampaignRedirect(url, MAPPING, {allowDefault: false})).toBe(
      '/p/b2b-landing',
    );
  });

  it('returns null on homepage UTM without mapping match', () => {
    const url = 'https://kazka.epirbizuteria.pl/?utm_campaign=unknown';
    expect(resolveCampaignRedirect(url, MAPPING, {allowDefault: false})).toBe(null);
  });

  it('returns default landing on /p without UTM', () => {
    const url = 'https://kazka.epirbizuteria.pl/p';
    expect(resolveCampaignRedirect(url, MAPPING, {allowDefault: true})).toBe(
      '/p/default-landing',
    );
  });

  it('returns null on /p without UTM and without default', () => {
    const url = 'https://kazka.epirbizuteria.pl/p';
    expect(resolveCampaignRedirect(url, {kazka_b2b: 'b2b-landing'}, {allowDefault: true})).toBe(
      null,
    );
  });
});
