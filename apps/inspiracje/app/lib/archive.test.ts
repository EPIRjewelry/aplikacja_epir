import {describe, expect, it} from 'vitest';
import {
  getArchiveSnapshot,
  paginateArchiveItems,
  parsePageParam,
  plainTextFromHtml,
  resolveCtaUrl,
  shopifyCdnWidth,
  toArchiveCard,
  type ArchiveItem,
} from './archive';

function fakeItem(n: number): ArchiveItem {
  return {
    id: `gid://shopify/Product/${n}`,
    handle: `item-${n}`,
    title: `Item ${n}`,
    productType: 'pierścionek',
    descriptionHtml: `<p>Opis <b>${n}</b> dłuższy tekst</p>`,
    featuredImage: {
      url: `https://cdn.shopify.com/s/files/1/0249/9756/0425/files/img-${n}.jpg?v=1`,
      altText: `Item ${n}`,
      width: 2000,
      height: 2000,
    },
    images: [],
  };
}

describe('archive helpers', () => {
  it('loads snapshot without price fields', () => {
    const snap = getArchiveSnapshot();
    const raw = JSON.stringify(snap);
    expect(raw).not.toMatch(/"price"/);
    expect(raw).not.toMatch(/"variants"/);
    expect(snap.ctaUrl).toContain('epirbizuteria.pl');
    expect(Array.isArray(snap.items)).toBe(true);
  });

  it('strips html for excerpts', () => {
    expect(plainTextFromHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('prefers env CTA', () => {
    expect(resolveCtaUrl('https://epirbizuteria.pl/pages/zaprojektuj-swoj-model')).toBe(
      'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model',
    );
  });

  it('paginates with PAGE_SIZE bounds', () => {
    const items = Array.from({length: 50}, (_, i) => fakeItem(i + 1));
    const p1 = paginateArchiveItems(items, 1, 24);
    expect(p1.page).toBe(1);
    expect(p1.totalPages).toBe(3);
    expect(p1.total).toBe(50);
    expect(p1.pageItems).toHaveLength(24);
    expect(p1.pageItems[0].handle).toBe('item-1');

    const p3 = paginateArchiveItems(items, 3, 24);
    expect(p3.page).toBe(3);
    expect(p3.pageItems).toHaveLength(2);

    const clamped = paginateArchiveItems(items, 99, 24);
    expect(clamped.page).toBe(3);

    const empty = paginateArchiveItems([], 1, 24);
    expect(empty.totalPages).toBe(1);
    expect(empty.pageItems).toHaveLength(0);
  });

  it('toArchiveCard is slim without descriptionHtml', () => {
    const card = toArchiveCard(fakeItem(7));
    expect(card).not.toHaveProperty('descriptionHtml');
    expect(card).not.toHaveProperty('images');
    expect(card.excerpt).toContain('Opis');
    expect(card.featuredImage?.url).toMatch(/width=800/);
  });

  it('shopifyCdnWidth appends width on CDN URLs', () => {
    const src =
      'https://cdn.shopify.com/s/files/1/0249/9756/0425/files/x.jpg?v=173';
    expect(shopifyCdnWidth(src, 600)).toContain('width=600');
    expect(shopifyCdnWidth('https://example.com/a.jpg', 600)).toBe(
      'https://example.com/a.jpg',
    );
  });

  it('parsePageParam defaults and clamps invalid', () => {
    expect(parsePageParam('https://inspiracje.epirbizuteria.pl/')).toBe(1);
    expect(parsePageParam('https://x.test/?page=2')).toBe(2);
    expect(parsePageParam('https://x.test/?page=0')).toBe(1);
    expect(parsePageParam('https://x.test/?page=abc')).toBe(1);
  });
});
