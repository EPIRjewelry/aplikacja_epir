import {describe, expect, it} from 'vitest';
import {parseCmsHeroSlides} from './kazka-cms-hero';

describe('parseCmsHeroSlides', () => {
  it('returns empty array when route is null', () => {
    expect(parseCmsHeroSlides(null)).toEqual([]);
  });

  it('parses section_hero image from CMS sections', () => {
    const slides = parseCmsHeroSlides({
      sections: {
        references: {
          nodes: [
            {
              type: 'section_featured_products',
              id: 'skip',
            },
            {
              type: 'section_hero',
              id: 'hero-kazka',
              heading: {value: 'KAZKA JEWELRY'},
              subheading: {value: 'Złoto i brylanty'},
              image: {
                reference: {
                  __typename: 'MediaImage',
                  image: {
                    url: 'https://cdn.shopify.com/hero.jpg',
                    altText: 'Kazka hero',
                  },
                },
              },
              cta_href: {value: '/collections/kazka'},
              cta_text: {value: 'Zobacz kolekcję'},
            },
          ],
        },
      },
    });

    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({
      id: 'hero-kazka',
      kind: 'image',
      src: 'https://cdn.shopify.com/hero.jpg',
      alt: 'Kazka hero',
      heading: 'KAZKA JEWELRY',
      subheading: 'Złoto i brylanty',
      ctaHref: '/collections/kazka',
      ctaText: 'Zobacz kolekcję',
    });
  });
});
