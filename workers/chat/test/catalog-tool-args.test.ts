import {describe, expect, it} from 'vitest';
import {
  normalizeCatalogImageSearchArgs,
  normalizeCatalogLookupArgs,
  normalizeCatalogSearchArgs,
} from '../src/catalog/catalog-tool-args';

const env = {WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl'};

describe('normalizeCatalogSearchArgs', () => {
  it('wraps legacy query into catalog.query with UCP meta', () => {
    const out = normalizeCatalogSearchArgs({query: 'pierścionek'}, env);
    expect(out.meta).toEqual({
      'ucp-agent': {profile: 'https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json'},
    });
    const catalog = out.catalog as Record<string, unknown>;
    expect(catalog.query).toBe('pierścionek');
    expect((catalog.context as Record<string, unknown>).intent).toBe('biżuteria');
    expect((catalog.pagination as Record<string, unknown>).limit).toBe(3);
  });

  it('caps pagination limit at 10', () => {
    const out = normalizeCatalogSearchArgs({catalog: {query: 'x', pagination: {limit: 99}}}, env);
    expect((out.catalog as Record<string, unknown>).pagination).toEqual({limit: 10});
  });

  it('merges commerce context for PLN', () => {
    const out = normalizeCatalogSearchArgs(
      {catalog: {query: 'obrączka'}},
      env,
      {
        country: 'PL',
        currency: 'PLN',
        language: 'pl-PL',
        address_country: 'PL',
        market: 'PL',
        locale: 'pl',
      },
    );
    const ctx = (out.catalog as Record<string, unknown>).context as Record<string, unknown>;
    expect(ctx.address_country).toBe('PL');
    expect(ctx.currency).toBe('PLN');
  });
});

describe('normalizeCatalogLookupArgs', () => {
  it('normalizes ids array and caps at 10', () => {
    const ids = Array.from({length: 12}, (_, i) => `gid://shopify/Product/${i + 1}`);
    const out = normalizeCatalogLookupArgs({ids}, env);
    expect((out.catalog as Record<string, unknown>).ids).toHaveLength(10);
  });

  it('accepts single id shorthand', () => {
    const out = normalizeCatalogLookupArgs(
      {id: 'gid://shopify/ProductVariant/1'},
      env,
    );
    expect((out.catalog as Record<string, unknown>).ids).toEqual([
      'gid://shopify/ProductVariant/1',
    ]);
  });
});

describe('normalizeCatalogImageSearchArgs', () => {
  it('adds catalog.like from base64 image', () => {
    const out = normalizeCatalogImageSearchArgs(
      {query: 'podobny', image_base64: 'abc123', image_content_type: 'image/png'},
      env,
    );
    const catalog = out.catalog as Record<string, unknown>;
    expect(catalog.query).toBe('podobny');
    expect(catalog.like).toEqual({
      image: {content_type: 'image/png', data: 'abc123'},
    });
  });

  it('adds catalog.like from reference_id', () => {
    const out = normalizeCatalogImageSearchArgs(
      {reference_id: 'gid://shopify/Product/42'},
      env,
    );
    expect((out.catalog as Record<string, unknown>).like).toEqual({
      id: 'gid://shopify/Product/42',
    });
  });
});
