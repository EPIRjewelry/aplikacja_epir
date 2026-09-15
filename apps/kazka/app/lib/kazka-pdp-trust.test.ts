import {describe, expect, it} from 'vitest';
import {buildKazkaProductTrustItems} from './kazka-pdp-trust';

describe('buildKazkaProductTrustItems', () => {
  it('includes only verifiable service links by default', () => {
    const items = buildKazkaProductTrustItems({});
    expect(items.some((i) => i.id === 'shipping')).toBe(true);
    expect(items.some((i) => i.id === 'returns')).toBe(true);
    expect(items.some((i) => i.id === 'chat')).toBe(true);
    expect(items.some((i) => i.id === 'workshop')).toBe(false);
    expect(items.some((i) => i.id === 'packaging')).toBe(false);
  });

  it('prepends stone from stone_profile when present', () => {
    const items = buildKazkaProductTrustItems({
      stoneProfile: {
        reference: {
          fields: [{key: 'stone_name', value: 'Brylant'}],
        },
      },
    });
    expect(items[0]?.id).toBe('stone');
    expect(items[0]?.value).toBe('Brylant');
  });
});
