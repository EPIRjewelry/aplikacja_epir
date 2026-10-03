import {describe, expect, it} from 'vitest';
import {pickEpirPixelSessionId} from './pixel-session-id';

describe('pickEpirPixelSessionId', () => {
  it('prefers _epir_session_id over _shopify_y, chat storage, and clientId', () => {
    expect(
      pickEpirPixelSessionId({
        epirSessionId: ' epir-id ',
        shopifyY: 'y-id',
        chatSessionStorage: 'chat-id',
        eventClientId: 'client-id',
        initClientId: 'init-id',
        remembered: 'remembered-id',
      }),
    ).toEqual({
      sessionId: 'epir-id',
      pinEpirCookie: false,
      pinChatStorage: false,
    });
  });

  it('uses _shopify_y when the epir cookie is empty and does not adopt a different chat storage id', () => {
    expect(
      pickEpirPixelSessionId({
        epirSessionId: '  ',
        shopifyY: 'y-id',
        chatSessionStorage: 'chat-id',
        eventClientId: 'client-id',
      }),
    ).toEqual({
      sessionId: 'y-id',
      pinEpirCookie: true,
      pinChatStorage: false,
    });
  });

  it('uses the chat sessionStorage id before clientId', () => {
    expect(
      pickEpirPixelSessionId({
        chatSessionStorage: 'chat-id',
        eventClientId: 'client-id',
      }),
    ).toEqual({
      sessionId: 'chat-id',
      pinEpirCookie: true,
      pinChatStorage: false,
    });
  });

  it('uses event clientId and pins it for chat when cookies and storage are empty', () => {
    expect(
      pickEpirPixelSessionId({
        eventClientId: ' client-id ',
        initClientId: 'init-id',
      }),
    ).toEqual({
      sessionId: 'client-id',
      pinEpirCookie: true,
      pinChatStorage: true,
    });
  });

  it('uses init clientId, then a remembered id, and never mints one', () => {
    expect(pickEpirPixelSessionId({initClientId: 'init-id', remembered: 'old'})).toEqual({
      sessionId: 'init-id',
      pinEpirCookie: true,
      pinChatStorage: true,
    });
    expect(pickEpirPixelSessionId({remembered: 'old'})).toEqual({
      sessionId: 'old',
      pinEpirCookie: true,
      pinChatStorage: true,
    });
    expect(pickEpirPixelSessionId({})).toEqual({
      sessionId: '',
      pinEpirCookie: false,
      pinChatStorage: false,
    });
  });
});
