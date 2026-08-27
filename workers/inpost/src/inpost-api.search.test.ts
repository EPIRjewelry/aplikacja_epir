import { describe, expect, it } from 'vitest';
import { InpostApiClient, type InpostPoint } from './inpost-api';

const samplePoints: InpostPoint[] = [
  {
    code: 'KRA01M',
    name: 'KRA01M',
    address: { street: 'Wadowicka 4', city: 'Kraków', postcode: '30-415', country: 'PL' },
    coordinates: { latitude: 50.03, longitude: 19.94 },
    type: 'parcel_locker',
    active: true,
  },
  {
    code: 'WRO01A',
    name: 'WRO01A',
    address: { street: 'Legnicka 58', city: 'Wrocław', postcode: '54-204', country: 'PL' },
    coordinates: { latitude: 51.11, longitude: 17.03 },
    type: 'parcel_locker',
    active: true,
  },
  {
    code: 'WRO02B',
    name: 'WRO02B',
    address: { street: 'Wrocławska 1', city: 'Legnica', postcode: '59-220', country: 'PL' },
    coordinates: { latitude: 51.21, longitude: 16.16 },
    type: 'parcel_locker',
    active: true,
  },
  {
    code: 'GDA01A',
    name: 'GDA01A',
    address: { street: 'Długa 1', city: 'Gdańsk', postcode: '80-001', country: 'PL' },
    coordinates: { latitude: 54.35, longitude: 18.65 },
    type: 'parcel_locker',
    active: true,
  },
  {
    code: 'POP-WRO103',
    name: 'POP-WRO103',
    address: { street: 'Grabiszyńska 10', city: 'Wrocław', postcode: '53-437', country: 'PL' },
    coordinates: { latitude: 51.10, longitude: 17.00 },
    type: 'pickup_point',
    active: true,
  },
];

describe('InpostApiClient.normalizeSearchText', () => {
  it('strips Polish diacritics', () => {
    expect(InpostApiClient.normalizeSearchText('Wrocław')).toBe('wroclaw');
    expect(InpostApiClient.normalizeSearchText('Łódź')).toBe('lodz');
  });
});

describe('InpostApiClient.looksLikeLockerCode', () => {
  it('matches locker prefixes and full codes', () => {
    expect(InpostApiClient.looksLikeLockerCode('KRA')).toBe(true);
    expect(InpostApiClient.looksLikeLockerCode('KRA01')).toBe(true);
    expect(InpostApiClient.looksLikeLockerCode('KRA01M')).toBe(true);
    expect(InpostApiClient.looksLikeLockerCode('WRO02BAPP')).toBe(true);
    expect(InpostApiClient.looksLikeLockerCode('POP-WRO103')).toBe(true);
    expect(InpostApiClient.looksLikeLockerCode('POP')).toBe(true);
  });

  it('rejects city and street names', () => {
    expect(InpostApiClient.looksLikeLockerCode('Wrocław')).toBe(false);
    expect(InpostApiClient.looksLikeLockerCode('wroclaw')).toBe(false);
    expect(InpostApiClient.looksLikeLockerCode('Legnicka')).toBe(false);
  });
});

describe('InpostApiClient.parseSearchQuery', () => {
  it('strips commas and street prefixes', () => {
    const tokens = InpostApiClient.parseSearchQuery('Wrocław, ul. Legnicka');
    expect(tokens.map(t => t.value)).toEqual(['wroclaw', 'legnicka']);
    expect(tokens.every(t => t.kind === 'text')).toBe(true);
  });

  it('classifies postcode and city', () => {
    const tokens = InpostApiClient.parseSearchQuery('54-204, Wrocław');
    expect(tokens).toEqual([
      { kind: 'postcode', value: '54-204' },
      { kind: 'text', value: 'wroclaw' },
    ]);
  });

  it('classifies locker prefix + city', () => {
    const tokens = InpostApiClient.parseSearchQuery('WRO Wrocław');
    expect(tokens).toEqual([
      { kind: 'code', value: 'WRO' },
      { kind: 'text', value: 'wroclaw' },
    ]);
  });
});

describe('InpostApiClient.filterByQuery', () => {
  it('returns Wrocław/WRO for wr, not Kraków KRA', () => {
    const results = InpostApiClient.filterByQuery(samplePoints, 'wr');
    const codes = results.map(p => p.code);
    expect(codes).toContain('WRO01A');
    expect(codes).toContain('WRO02B');
    expect(codes).not.toContain('KRA01M');
  });

  it('matches wroclaw without diacritics', () => {
    const results = InpostApiClient.filterByQuery(samplePoints, 'wroclaw');
    expect(results.some(p => p.code === 'WRO01A')).toBe(true);
  });

  it('matches code prefix KRA01', () => {
    const results = InpostApiClient.filterByQuery(samplePoints, 'KRA01');
    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('KRA01M');
  });

  it('single letter only matches code prefix', () => {
    const wResults = InpostApiClient.filterByQuery(samplePoints, 'w');
    expect(wResults.every(p => p.code.startsWith('W') || p.code.startsWith('w'))).toBe(true);

    const xResults = InpostApiClient.filterByQuery(samplePoints, 'x');
    expect(xResults).toHaveLength(0);
  });

  it('returns empty for zzz nonsense', () => {
    expect(InpostApiClient.filterByQuery(samplePoints, 'zzz')).toHaveLength(0);
  });

  // --- 4 user variants ---

  it('v1: postcode + city with space or comma', () => {
    for (const q of ['54-204 Wrocław', '54-204, Wrocław']) {
      const results = InpostApiClient.filterByQuery(samplePoints, q);
      expect(results.map(p => p.code)).toEqual(['WRO01A']);
    }
  });

  it('v1b: locker prefix + city', () => {
    const results = InpostApiClient.filterByQuery(samplePoints, 'WRO Wrocław');
    const codes = results.map(p => p.code);
    expect(codes).toContain('WRO01A');
    expect(codes).toContain('POP-WRO103');
    expect(codes).not.toContain('WRO02B'); // Legnica
    expect(codes).not.toContain('KRA01M');
  });

  it('v2: city only still works', () => {
    const results = InpostApiClient.filterByQuery(samplePoints, 'Wrocław');
    expect(results.some(p => p.code === 'WRO01A')).toBe(true);
  });

  it('v3: city with trailing comma, street prefix, combined', () => {
    expect(InpostApiClient.filterByQuery(samplePoints, 'Wrocław,').some(p => p.code === 'WRO01A')).toBe(true);

    const withStreet = InpostApiClient.filterByQuery(samplePoints, 'Wrocław, ul. Legnicka');
    expect(withStreet.map(p => p.code)).toEqual(['WRO01A']);

    const streetOnly = InpostApiClient.filterByQuery(samplePoints, 'ul. Legnicka');
    expect(streetOnly.map(p => p.code)).toEqual(['WRO01A']);

    const spaceCombo = InpostApiClient.filterByQuery(samplePoints, 'Wrocław Legnicka');
    expect(spaceCombo.map(p => p.code)).toEqual(['WRO01A']);
  });

  it('v4: full locker signature and POP code', () => {
    expect(InpostApiClient.filterByQuery(samplePoints, 'KRA01M').map(p => p.code)).toEqual(['KRA01M']);
    expect(InpostApiClient.filterByQuery(samplePoints, 'KRA01').map(p => p.code)).toEqual(['KRA01M']);
    expect(InpostApiClient.filterByQuery(samplePoints, 'KRA0').map(p => p.code)).toEqual(['KRA01M']);
    expect(InpostApiClient.filterByQuery(samplePoints, 'POP-WRO103').map(p => p.code)).toEqual(['POP-WRO103']);
  });
});

describe('InpostApiClient.rankByQuery', () => {
  it('ranks exact code before street partial match', () => {
    const filtered = InpostApiClient.filterByQuery(samplePoints, 'wro');
    const ranked = InpostApiClient.rankByQuery(filtered, 'wro');
    expect(ranked[0].code).toMatch(/^WRO|^POP-WRO/);
  });

  it('ranks city Wrocław before Legnica street Wrocławska for wroclaw query', () => {
    const filtered = InpostApiClient.filterByQuery(samplePoints, 'wroclaw');
    const ranked = InpostApiClient.rankByQuery(filtered, 'wroclaw');
    expect(ranked[0].address.city).toBe('Wrocław');
  });
});

describe('InpostApiClient.searchPoints', () => {
  it('returns different results for different queries on same dataset', () => {
    const kra = InpostApiClient.searchPoints(samplePoints, 'KRA');
    const wro = InpostApiClient.searchPoints(samplePoints, 'WRO');
    expect(kra[0]?.code).toBe('KRA01M');
    expect(wro[0]?.code).toMatch(/^WRO|^POP-WRO/);
    expect(kra[0]?.code).not.toBe(wro[0]?.code);
  });
});
