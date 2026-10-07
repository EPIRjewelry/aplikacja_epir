import {describe, expect, it, vi} from 'vitest';
import {createKazkaCatalogRepository} from '../src/facts/gk-repository';

describe('GK catalog repository', () => {
  it('no KAZKA token → no_token, no fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const repo = await createKazkaCatalogRepository({} as import('../src/config/bindings').Env);
    const status = await repo.status();
    expect(status.available).toBe(false);
    expect(status.reason).toBe('no_token');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
