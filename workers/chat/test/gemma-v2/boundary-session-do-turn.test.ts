import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn} from '../../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../../src/buyer/channel-switch';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {ensureBuyerSessionContext} from '../../src/buyer/session-context';
import {appendBuyerSessionMessage} from '../../src/buyer/session-history';
import type {Env} from '../../src/config/bindings';
import {geBuyerBody, FIKCYJNY_SESSION_ID} from './fixtures/boundary-payloads';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';
import {callOrderIndexes, makeTrackedSessionNamespace} from './helpers/session-do-calls';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('E0 boundary — SessionDO call order in buyer turn', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('compose path: set-session-id → set-storefront-context before append user/assistant', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    const {namespace, calls} = makeTrackedSessionNamespace();
    const env = {SESSION_DO: namespace} as Env;

    vi.spyOn(compose, 'composeBuyerAssistantReply').mockImplementation(
      async (_env, channelId, userText, _req, opts) => {
        const sid = opts?.sessionId;
        await ensureBuyerSessionContext(_env, {
          sessionId: sid,
          channelId,
          storefrontId: 'online-store',
          bodyChannel: 'online-store',
          userText,
        });
        if (sid) {
          await appendBuyerSessionMessage(_env, sid, 'user', userText);
          await appendBuyerSessionMessage(_env, sid, 'assistant', 'Odpowiedź fikcyjna.');
        }
        return 'Odpowiedź fikcyjna.';
      },
    );

    const body = geBuyerBody();
    await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);

    const setSid = callOrderIndexes(calls, 'set-session-id');
    const setSf = callOrderIndexes(calls, 'set-storefront-context');
    const appends = callOrderIndexes(calls, 'append');
    expect(setSid.length).toBeGreaterThan(0);
    expect(setSf.length).toBeGreaterThan(0);
    expect(appends.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...setSid)).toBeLessThan(Math.min(...setSf));
    expect(Math.min(...setSf)).toBeLessThan(Math.min(...appends));

    const appendRoles = calls
      .filter((c) => c.path === 'append')
      .map((c) => (c.body as {role?: string}).role);
    expect(appendRoles).toEqual(['user', 'assistant']);
    expect(appendRoles.every((r) => r === 'user' || r === 'assistant')).toBe(true);
  });

  it('second turn reuses same Session DO id', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    const {namespace, calls} = makeTrackedSessionNamespace();
    const env = {SESSION_DO: namespace} as Env;

    vi.spyOn(compose, 'composeBuyerAssistantReply').mockImplementation(
      async (_env, channelId, userText, _req, opts) => {
        await ensureBuyerSessionContext(_env, {
          sessionId: opts?.sessionId,
          channelId,
          storefrontId: 'online-store',
          bodyChannel: 'online-store',
          userText,
        });
        return 'ok';
      },
    );

    const body1 = geBuyerBody({message: 'Tura jeden'});
    const res1 = await handleBuyerTurn(postReq(body1), env, geBuyerBrandLock(), body1);
    const json1 = (await res1.json()) as {session_id?: string};
    const sid = json1.session_id!;
    const before = calls.length;

    const body2 = geBuyerBody({message: 'Tura dwa', session_id: sid});
    await handleBuyerTurn(postReq(body2), env, geBuyerBrandLock(), body2);

    const turn2 = calls.slice(before);
    expect(turn2.every((c) => c.doId === sid)).toBe(true);
    expect(turn2.some((c) => c.path === 'set-session-id')).toBe(true);
  });
});
