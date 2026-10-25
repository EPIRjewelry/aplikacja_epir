import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn, acceptOrReplaceBuyerSessionId} from '../../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../../src/buyer/channel-switch';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {handleChatSessionLinkedFromPixel} from '../../src/buyer/session-context';
import {
  FIKCYJNY_LEGACY_SESSION_TOKEN,
  FIKCYJNY_SHOPIFY_Y_SHAPED,
  geBuyerBody,
} from './fixtures/boundary-payloads';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('E0 boundary — sess_* session id (server)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('minted session_id from handleBuyerTurn always has sess_ prefix', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ok');

    const body = geBuyerBody({session_id: undefined});
    delete (body as {session_id?: string}).session_id;
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as {session_id?: string};
    expect(json.session_id).toMatch(/^sess_[0-9a-f-]{36}$/i);
  });

  it('acceptOrReplaceBuyerSessionId mint never returns _shopify_y-shaped uuid without sess_ prefix', () => {
    const minted = acceptOrReplaceBuyerSessionId(undefined);
    expect(minted).toMatch(/^sess_/);
    expect(minted).not.toBe(FIKCYJNY_SHOPIFY_Y_SHAPED);
    const replaced = acceptOrReplaceBuyerSessionId('; DROP TABLE sessions; --');
    expect(replaced).toMatch(/^sess_/);
  });

  it('valid non-sess charset id may be echoed; mint still sess_*', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ok');

    const body = geBuyerBody({session_id: FIKCYJNY_LEGACY_SESSION_TOKEN});
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as {session_id?: string};
    expect(json.session_id).toBe(FIKCYJNY_LEGACY_SESSION_TOKEN);
  });

  it('chat_session_linked rejects id without sess_ prefix', async () => {
    const result = await handleChatSessionLinkedFromPixel({} as never, {
      data: {
        chat_session_id: FIKCYJNY_SHOPIFY_Y_SHAPED,
        client_id: 'pixel-client-fikcyjny',
      },
    });
    expect(result).toBe('invalid');
  });

  it('chat_session_linked accepts fikcyjny sess_* shape', async () => {
    const result = await handleChatSessionLinkedFromPixel({} as never, {
      data: {
        chat_session_id: 'sess_pixel-fikcyjny-0001',
        client_id: 'pixel-client-fikcyjny',
      },
    });
    expect(result).toBe('unknown_session');
  });
});
