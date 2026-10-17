import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn} from '../../src/buyer/handle-buyer-turn';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {GEMMA_TESTERS_KV_KEY} from '../../src/gemma/internal-access';
import {channelKvKey, coreKvKey} from '../../src/buyer/channel-switch';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {
  FIKCYJNY_TESTER_ID,
  geInternalTesterIngress,
  makeGemmaRuntimeKv,
} from './fixtures/fake-testers-kv';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('E1 KV read policy (W2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not read gemma:testers when mode is on', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ok');
    const getSpy = vi.fn(async (key: string) => {
      if (key === channelKvKey('epir-online-store')) return 'on';
      if (key === coreKvKey('epir-online-store')) return 'legacy';
      return null;
    });
    const env = {GEMMA_RUNTIME_KV: {get: getSpy}} as never;
    const body = geBuyerBody();
    await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body, geInternalTesterIngress());
    const keys = getSpy.mock.calls.map((c) => c[0]);
    expect(keys).not.toContain(GEMMA_TESTERS_KV_KEY);
  });

  it('does not read gemma:testers when mode is off', async () => {
    const getSpy = vi.fn(async (key: string) => {
      if (key === channelKvKey('epir-online-store')) return 'off';
      if (key === coreKvKey('epir-online-store')) return 'legacy';
      return null;
    });
    const env = {GEMMA_RUNTIME_KV: {get: getSpy}} as never;
    const body = geBuyerBody();
    await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body, geInternalTesterIngress());
    expect(getSpy.mock.calls.map((c) => c[0])).not.toContain(GEMMA_TESTERS_KV_KEY);
  });

  it('reads channel and core KV in parallel (M8)', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ok');
    let inFlight = 0;
    let maxInFlight = 0;
    const getSpy = vi.fn(async (key: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight -= 1;
      if (key === channelKvKey('epir-online-store')) return 'on';
      if (key === coreKvKey('epir-online-store')) return 'legacy';
      return null;
    });
    const env = {GEMMA_RUNTIME_KV: {get: getSpy}} as never;
    const body = geBuyerBody();
    await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
    expect(getSpy).toHaveBeenCalledWith(channelKvKey('epir-online-store'));
    expect(getSpy).toHaveBeenCalledWith(coreKvKey('epir-online-store'));
  });
});
