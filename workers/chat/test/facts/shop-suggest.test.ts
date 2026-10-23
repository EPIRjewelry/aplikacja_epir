import {describe, expect, it} from 'vitest';
import {
  extractHandlesFromSuggestJson,
  handleFromProductPath,
} from '../../src/facts/shop-suggest';

describe('shop Ajax suggest.json parse', () => {
  it('T-SUGGEST-1: exact handles from resources.results.products', () => {
    const handles = extractHandlesFromSuggestJson({
      resources: {
        results: {
          products: [
            {handle: 'pierscionek-galazki-z-granatem', url: '/products/pierscionek-galazki-z-granatem'},
            {
              handle: 'pierscionek-srebrny-z-granatem',
              url: '/products/pierscionek-srebrny-z-granatem',
            },
            {handle: 'pierscionek-kwiat-z-granatem'},
          ],
        },
      },
    });
    expect(handles).toEqual([
      'pierscionek-galazki-z-granatem',
      'pierscionek-srebrny-z-granatem',
      'pierscionek-kwiat-z-granatem',
    ]);
  });

  it('T-SUGGEST-2: handle from url path when handle field missing', () => {
    expect(handleFromProductPath('/products/pierscionek-srebrny-z-granatem?variant=1')).toBe(
      'pierscionek-srebrny-z-granatem',
    );
    const handles = extractHandlesFromSuggestJson({
      resources: {
        products: [{url: 'https://epirbizuteria.pl/products/pierscionek-srebrny-z-granatem'}],
      },
    });
    expect(handles).toEqual(['pierscionek-srebrny-z-granatem']);
  });
});
