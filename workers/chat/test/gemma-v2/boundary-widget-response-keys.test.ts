import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn, BUYER_CLIENT_ERROR_MESSAGE} from '../../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../../src/buyer/channel-switch';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {geBuyerBody, FIKCYJNY_SESSION_ID} from './fixtures/boundary-payloads';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

/** Pola czytane przez GE assistant-runtime.js i Hydrogen ChatWidget (kontrakt serwera). */
function expectWidgetSuccessFields(json: Record<string, unknown>) {
  expect(typeof json.reply).toBe('string');
  expect((json.reply as string).length).toBeGreaterThan(0);
  expect(typeof json.session_id).toBe('string');
}

describe('E0 boundary — widget-consumed response keys', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('200 success exposes reply and session_id (Hydrogen requires reply)', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Tekst dla widżetu.');

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expectWidgetSuccessFields(json);
    expect(json.type).toBe('message');
    expect(json.session_id).toBe(FIKCYJNY_SESSION_ID);
  });

  it('400 exposes error string for ChatWidget errData.error', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    const res = await handleBuyerTurn(
      postReq({message: ''}),
      {} as never,
      geBuyerBrandLock(),
      {message: ''},
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(400);
    expect(typeof json.error).toBe('string');
    expect(json.error).toBe(BUYER_CLIENT_ERROR_MESSAGE);
  });

  it('500 assistant_failed exposes error string', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(new Error('fail'));

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(500);
    expect(typeof json.error).toBe('string');
  });

  it('unavailable still exposes reply text for display', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('off');
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(typeof json.reply).toBe('string');
    expect((json.reply as string).length).toBeGreaterThan(0);
  });
});
