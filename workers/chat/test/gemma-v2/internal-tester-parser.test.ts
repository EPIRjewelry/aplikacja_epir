import {describe, expect, it} from 'vitest';
import {readGemmaTesterIds, isAllowedGemmaInternalTurn} from '../../src/gemma/internal-access';

function kvWithTestersRaw(raw: string | null): KVNamespace {
  return {
    async get(key: string) {
      if (key === 'gemma:testers') return raw;
      return null;
    },
  } as KVNamespace;
}

describe('E1 gemma:testers parser (M3)', () => {
  it('invalid JSON → empty set', async () => {
    const ids = await readGemmaTesterIds({GEMMA_RUNTIME_KV: kvWithTestersRaw('{not-json')});
    expect(ids.size).toBe(0);
  });

  it('non-array JSON → empty set', async () => {
    const ids = await readGemmaTesterIds({GEMMA_RUNTIME_KV: kvWithTestersRaw('{"a":1}')});
    expect(ids.size).toBe(0);
  });

  it('empty array → nobody is tester', async () => {
    const ids = await readGemmaTesterIds({GEMMA_RUNTIME_KV: kvWithTestersRaw('[]')});
    expect(ids.size).toBe(0);
    expect(
      isAllowedGemmaInternalTurn({
        channelId: 'epir-online-store',
        appProxyVerified: true,
        loggedInCustomerId: '9001002001',
        testerIds: ids,
      }),
    ).toBe(false);
  });

  it('array with non-strings → only string ids kept', async () => {
    const ids = await readGemmaTesterIds({
      GEMMA_RUNTIME_KV: kvWithTestersRaw('["9001002001", 42, null, ""]'),
    });
    expect([...ids]).toEqual(['9001002001']);
  });
});
