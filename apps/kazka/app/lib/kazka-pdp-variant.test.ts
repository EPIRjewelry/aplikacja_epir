import {describe, expect, it} from 'vitest';
import {
  allSizeValuesNumericRingScale,
  canAddToCart,
  formatProductTilePriceLabel,
  formatSizeChipLabel,
  isSizeMissingFromSearchParams,
  listMissingOptionNames,
  nextPromptOptionName,
} from './kazka-pdp-variant';

describe('kazka-pdp-variant', () => {
  it('formats mm when all sizes are numeric 5-35', () => {
    expect(allSizeValuesNumericRingScale(['7', '14', '30'])).toBe(true);
    expect(formatSizeChipLabel('7', true)).toBe('7 (47 mm)');
    expect(formatSizeChipLabel('14', true)).toBe('14 (54 mm)');
  });

  it('rejects mm when any size is non-numeric', () => {
    expect(allSizeValuesNumericRingScale(['7', 'S'])).toBe(false);
  });

  it('blocks add to cart when size option missing from URL', () => {
    const options = [{name: 'Rozmiar', values: ['7', '8']}];
    const params = new URLSearchParams('Pr%C3%B3ba%20z%C5%82ota=14%20karat%C3%B3w');
    expect(isSizeMissingFromSearchParams(options, params)).toBe(true);
    expect(canAddToCart(options, params, 'gid://shopify/ProductVariant/1')).toBe(
      false,
    );
  });

  it('lists missing options in product order', () => {
    const options = [
      {name: 'Próba złota', values: ['14 karatów']},
      {name: 'Jakość', values: ['LAB']},
      {name: 'Rozmiar', values: ['7']},
    ];
    const params = new URLSearchParams();
    expect(listMissingOptionNames(options, params)).toEqual([
      'Próba złota',
      'Jakość',
      'Rozmiar',
    ]);
    params.set('Próba złota', '14 karatów');
    expect(listMissingOptionNames(options, params)).toEqual(['Jakość', 'Rozmiar']);
  });

  it('cycles prompt through missing option names', () => {
    const missing = ['Próba złota', 'Rozmiar'];
    expect(nextPromptOptionName(missing, null)).toBe('Próba złota');
    expect(nextPromptOptionName(missing, 'Próba złota')).toBe('Rozmiar');
    expect(nextPromptOptionName(missing, 'Rozmiar')).toBe('Próba złota');
  });

  it('prefixes od when min and max differ', () => {
    const label = formatProductTilePriceLabel(
      {amount: '3985', currencyCode: 'PLN'},
      {amount: '4929', currencyCode: 'PLN'},
    );
    expect(label).toMatch(/^od\s/);
  });
});
