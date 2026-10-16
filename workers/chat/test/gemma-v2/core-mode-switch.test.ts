import {describe, expect, it, vi} from 'vitest';
import {readGemmaCoreMode, coreKvKey} from '../../src/buyer/channel-switch';
import * as compose from '../../src/buyer/compose-buyer-turn';
import * as gemmaCompose from '../../src/gemma/compose-gemma-reply';
import {handleBuyerTurn} from '../../src/buyer/handle-buyer-turn';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('E1 readGemmaCoreMode', () => {
  it('missing key → legacy', async () => {
    const kv = makeGemmaRuntimeKv({coreMode: undefined});
    expect(await readGemmaCoreMode({GEMMA_RUNTIME_KV: kv}, 'epir-online-store')).toBe('legacy');
  });

  it('legacy and v2 values', async () => {
    expect(
      await readGemmaCoreMode(
        {GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({coreMode: 'legacy'})},
        'epir-online-store',
      ),
    ).toBe('legacy');
    expect(
      await readGemmaCoreMode(
        {GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({coreMode: 'v2'})},
        'epir-online-store',
      ),
    ).toBe('v2');
  });

  it('unknown value → legacy', async () => {
    const kv = {
      async get(key: string) {
        if (key === coreKvKey('epir-online-store')) return 'experimental';
        return null;
      },
    } as KVNamespace;
    expect(await readGemmaCoreMode({GEMMA_RUNTIME_KV: kv}, 'epir-online-store')).toBe('legacy');
  });

  it('KV error → legacy', async () => {
    const kv = {
      async get() {
        throw new Error('kv down');
      },
    } as KVNamespace;
    expect(await readGemmaCoreMode({GEMMA_RUNTIME_KV: kv}, 'epir-online-store')).toBe('legacy');
  });
});

describe('E1 handleBuyerTurn core routing', () => {
  it('v2 calls composeGemmaReply, not legacy compose', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('legacy');
    const gemmaSpy = vi.spyOn(gemmaCompose, 'composeGemmaReply').mockResolvedValue('v2 awaryjny');

    const env = {GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({coreMode: 'v2'})} as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    const json = (await res.json()) as {reply?: string};

    expect(gemmaSpy).toHaveBeenCalledTimes(1);
    expect(compose.composeBuyerAssistantReply).not.toHaveBeenCalled();
    expect(json.reply).toBe('v2 awaryjny');
  });
});
