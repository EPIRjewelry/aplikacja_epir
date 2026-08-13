import {describe, expect, it} from 'vitest';
import {shopifyCdnSrcset, shopifyCdnWidth} from '../src/shopify-cdn';
import {renderHeroPicture} from '../src/hero-picture';
import {resolveHeroImage} from '../src/stone-profile-hero';

const CDN =
  'https://cdn.shopify.com/s/files/1/0000/0001/files/ring.jpg?v=1';

describe('shopifyCdnWidth', () => {
  it('sets width on Shopify CDN URLs', () => {
    const out = shopifyCdnWidth(CDN, 768);
    expect(out).toContain('width=768');
    expect(out).toContain('v=1');
  });

  it('leaves non-Shopify URLs unchanged', () => {
    expect(shopifyCdnWidth('https://example.com/a.jpg', 100)).toBe(
      'https://example.com/a.jpg',
    );
  });
});

describe('shopifyCdnSrcset', () => {
  it('builds width descriptors', () => {
    const s = shopifyCdnSrcset(CDN, [768, 1536]);
    expect(s).toMatch(/768w/);
    expect(s).toMatch(/1536w/);
  });
});

describe('renderHeroPicture', () => {
  it('emits picture with LCP attrs and breakpoints', () => {
    const html = renderHeroPicture({
      url: CDN,
      alt: 'Makro kamienia',
      lcp: true,
    });
    expect(html).toContain('<picture>');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('(max-width: 767px)');
    expect(html).toContain('(max-width: 1023px)');
    expect(html).toContain('width=768');
    expect(html).toContain('width=1600');
  });

  it('uses lazy without LCP', () => {
    const html = renderHeroPicture({
      url: CDN,
      alt: 'x',
      lcp: false,
    });
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('fetchpriority');
  });
});

describe('resolveHeroImage', () => {
  it('prefers override by handle', () => {
    const r = resolveHeroImage(
      {
        handle: 'pierscionek-test',
        title: 'T',
        featuredImage: {url: CDN, altText: 'feat'},
      },
      {'pierscionek-test': 'https://cdn.shopify.com/override.jpg'},
    );
    expect(r?.source).toBe('override');
    expect(r?.url).toContain('override.jpg');
  });

  it('picks media matching stone_profile alt', () => {
    const r = resolveHeroImage({
      handle: 'a',
      title: 'Ring',
      featuredImage: {url: CDN, altText: 'pack'},
      media: [
        {image: {url: CDN + '&x=1', altText: 'packshot'}},
        {
          image: {
            url: 'https://cdn.shopify.com/s/files/1/0000/0001/files/stone_profile.jpg',
            altText: 'stone_profile size 16',
          },
        },
      ],
    });
    expect(r?.source).toBe('stone_media');
    expect(r?.url).toContain('stone_profile');
  });

  it('falls back to featuredImage', () => {
    const r = resolveHeroImage({
      handle: 'b',
      featuredImage: {url: CDN, altText: 'f'},
    });
    expect(r?.source).toBe('featured');
  });
});
