import { describe, expect, it, vi } from 'vitest';
import { countryDatasetCacheKey, getCountryPoints } from './index';
import { InpostApiClient, type InpostPoint } from './inpost-api';
import type { Env } from './env';

const mockDataset: InpostPoint[] = [
  {
    code: 'KRA01M',
    name: 'KRA01M',
    address: { street: 'A', city: 'Kraków', postcode: '30-415', country: 'PL' },
    type: 'parcel_locker',
    active: true,
  },
  {
    code: 'WRO01A',
    name: 'WRO01A',
    address: { street: 'B', city: 'Wrocław', postcode: '54-204', country: 'PL' },
    type: 'parcel_locker',
    active: true,
  },
];

describe('countryDatasetCacheKey', () => {
  it('uses v4 prefix to avoid stale v3 filtered cache', () => {
    expect(countryDatasetCacheKey('PL')).toBe('points:v4:all:PL');
  });
});

describe('getCountryPoints', () => {
  it('returns cached dataset on hit without refetching', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify(mockDataset));
    const put = vi.fn();
    const fetchAllCountryPoints = vi.fn();

    const env = { INPOST_POINTS_CACHE: { get, put } } as unknown as Env;
    const client = { fetchAllCountryPoints } as unknown as InpostApiClient;

    const first = await getCountryPoints(env, client, 'PL');
    expect(first.cacheStatus).toBe('dataset-hit');
    expect(first.points).toHaveLength(2);
    expect(fetchAllCountryPoints).not.toHaveBeenCalled();

    const kra = InpostApiClient.searchPoints(first.points, 'KRA');
    const wro = InpostApiClient.searchPoints(first.points, 'WRO');
    expect(kra[0].code).toBe('KRA01M');
    expect(wro[0].code).toBe('WRO01A');
  });

  it('fetches and caches dataset on miss', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const put = vi.fn();
    const fetchAllCountryPoints = vi.fn().mockResolvedValue(mockDataset);

    const env = { INPOST_POINTS_CACHE: { get, put } } as unknown as Env;
    const client = { fetchAllCountryPoints } as unknown as InpostApiClient;

    const result = await getCountryPoints(env, client, 'PL');
    expect(result.cacheStatus).toBe('dataset-miss');
    expect(fetchAllCountryPoints).toHaveBeenCalledWith('PL');
    expect(put).toHaveBeenCalledWith(
      'points:v4:all:PL',
      JSON.stringify(mockDataset),
      expect.objectContaining({ expirationTtl: 21600 }),
    );
  });
});
