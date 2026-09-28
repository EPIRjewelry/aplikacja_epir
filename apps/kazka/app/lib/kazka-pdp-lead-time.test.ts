import {describe, expect, it} from 'vitest';
import {formatLeadTimePhrase, resolveLeadTimeDays} from './kazka-pdp-lead-time';

describe('kazka-pdp-lead-time', () => {
  it('reads metafield custom.czas_wykonania', () => {
    expect(
      resolveLeadTimeDays({
        czasWykonania: {value: '10'},
        tags: [],
      }),
    ).toEqual({days: 10, source: 'metafield'});
  });

  it('reads tag 3-dni', () => {
    expect(
      resolveLeadTimeDays({
        tags: ['kazka-classic', '3-dni'],
      }),
    ).toEqual({days: 3, source: 'tag'});
  });

  it('returns missing without data', () => {
    expect(
      resolveLeadTimeDays({
        tags: ['kazka-classic'],
        title: 'Soliter',
        handle: 'soliter',
      }),
    ).toEqual({days: null, source: 'missing'});
  });

  it('formats phrase with and without days', () => {
    expect(formatLeadTimePhrase(10)).toBe('Wykonanie 10 dni roboczych');
    expect(formatLeadTimePhrase(null)).toBe('Wykonanie');
  });
});
