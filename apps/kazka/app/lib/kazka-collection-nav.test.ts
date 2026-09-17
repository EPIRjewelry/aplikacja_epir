import {describe, expect, it} from 'vitest';
import {
  HEADER_KAT_NAV_OPTIONS,
  buildCategoryHref,
  buildClearKatParams,
  buildClearLiniaParams,
  buildKatParams,
  buildLiniaParams,
  pickLabVariant,
  preferVariantOptionsForLinia,
} from './kazka-collection-nav';

describe('kazka-collection-nav', () => {
  it('buildLiniaParams sets linia and strips pagination', () => {
    const current = new URLSearchParams(
      'metal=zloto-zolte&cursor=abc&direction=next&sort=price_asc',
    );
    expect(buildLiniaParams(current, 'lab')).toBe(
      'metal=zloto-zolte&sort=price_asc&linia=lab',
    );
  });

  it('buildLiniaParams removes linia when empty value', () => {
    const current = new URLSearchParams('linia=lab&kat=kolczyki');
    expect(buildLiniaParams(current, '')).toBe('kat=kolczyki');
  });

  it('buildKatParams sets kat and preserves linia', () => {
    const current = new URLSearchParams('linia=lab&cursor=xyz');
    expect(buildKatParams(current, 'pierscionek')).toBe(
      'linia=lab&kat=pierscionek',
    );
  });

  it('buildCategoryHref uses hub path and keeps only linia+kat', () => {
    const current = new URLSearchParams(
      'linia=lab&metal=zloto-zolte&cursor=abc&kat=kolczyki',
    );
    expect(
      buildCategoryHref('/collections/kazka', current, 'pierscionek'),
    ).toBe('/collections/kazka?linia=lab&kat=pierscionek');
    expect(buildCategoryHref('/collections/kazka', current, '')).toBe(
      '/collections/kazka?linia=lab',
    );
  });

  it('HEADER_KAT_NAV_OPTIONS excludes empty all-types entry', () => {
    expect(HEADER_KAT_NAV_OPTIONS.every((opt) => opt.value !== '')).toBe(true);
    expect(HEADER_KAT_NAV_OPTIONS.map((o) => o.value)).toEqual([
      'pierscionek',
      'naszyjnik',
      'kolczyki',
      'bransoletka',
    ]);
  });

  it('buildClearKatParams and buildClearLiniaParams remove only nav axis', () => {
    const current = new URLSearchParams('linia=lab&kat=kolczyki&proba=18');
    expect(buildClearKatParams(current)).toBe('linia=lab&proba=18');
    expect(buildClearLiniaParams(current)).toBe('kat=kolczyki&proba=18');
  });

  it('pickLabVariant finds LAB quality option', () => {
    const variants = [
      {
        id: '1',
        selectedOptions: [{name: 'Jakość', value: 'D/VVS2'}],
      },
      {
        id: '2',
        selectedOptions: [{name: 'Jakość', value: 'LAB'}],
      },
    ];
    expect(pickLabVariant(variants)?.id).toBe('2');
  });

  it('preferVariantOptionsForLinia returns LAB options only for lab line', () => {
    expect(preferVariantOptionsForLinia('lab')).toEqual([
      {name: 'Jakość', value: 'LAB'},
    ]);
    expect(preferVariantOptionsForLinia('fancy')).toBeUndefined();
  });
});
