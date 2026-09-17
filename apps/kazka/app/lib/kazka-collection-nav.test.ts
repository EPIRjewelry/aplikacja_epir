import {describe, expect, it} from 'vitest';
import {
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
