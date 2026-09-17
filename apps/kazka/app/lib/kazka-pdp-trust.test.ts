import {describe, expect, it} from 'vitest';
import {
  buildKazkaProductTrustItems,
  kazkaProductStoneLabel,
} from './kazka-pdp-trust';

describe('kazkaProductStoneLabel', () => {
  it('returns stone name from custom.main_stone when present', () => {
    expect(
      kazkaProductStoneLabel({
        mainStone: {value: 'Brylant'},
      }),
    ).toBe('Brylant');
  });

  it('returns undefined when main_stone is empty or whitespace', () => {
    expect(kazkaProductStoneLabel({mainStone: {value: ''}})).toBeUndefined();
    expect(kazkaProductStoneLabel({mainStone: {value: '   '}})).toBeUndefined();
  });

  it('returns undefined when no metafield', () => {
    expect(kazkaProductStoneLabel({})).toBeUndefined();
  });
});

describe('buildKazkaProductTrustItems', () => {
  it('includes only verifiable service links', () => {
    const items = buildKazkaProductTrustItems({});
    expect(items.some((i) => i.id === 'shipping')).toBe(true);
    expect(items.some((i) => i.id === 'returns')).toBe(true);
    expect(items.some((i) => i.id === 'chat')).toBe(true);
    expect(items.some((i) => i.id === 'workshop')).toBe(false);
    expect(items.some((i) => i.id === 'packaging')).toBe(false);
    expect(items.some((i) => i.id === 'stone')).toBe(false);
  });

  it('does not include stone even when main_stone is present', () => {
    const items = buildKazkaProductTrustItems({
      mainStone: {value: 'Brylant'},
    });
    expect(items.some((i) => i.id === 'stone')).toBe(false);
  });
});
