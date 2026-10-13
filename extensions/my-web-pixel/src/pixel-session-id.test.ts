import {describe, expect, it} from 'vitest';
import {
  isValidChatSessionLinkId,
  pickEpirPixelSessionId,
} from './pixel-session-id';

describe('pickEpirPixelSessionId', () => {
  it('uses event clientId first', () => {
    expect(
      pickEpirPixelSessionId({
        eventClientId: 'from-event',
        initClientId: 'from-init',
        remembered: 'from-memory',
      }).sessionId,
    ).toBe('from-event');
  });

  it('falls back to init then remembered', () => {
    expect(
      pickEpirPixelSessionId({
        eventClientId: '',
        initClientId: 'from-init',
        remembered: 'from-memory',
      }).sessionId,
    ).toBe('from-init');
    expect(
      pickEpirPixelSessionId({
        eventClientId: '',
        initClientId: '',
        remembered: 'from-memory',
      }).sessionId,
    ).toBe('from-memory');
  });

  it('returns empty when no clientId sources', () => {
    expect(pickEpirPixelSessionId({}).sessionId).toBe('');
  });
});

describe('isValidChatSessionLinkId', () => {
  it('accepts sess_* chat ids', () => {
    expect(isValidChatSessionLinkId('sess_already-stored-id-0001')).toBe(true);
    expect(isValidChatSessionLinkId('sess_00000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it('rejects pixel client ids and empty', () => {
    expect(isValidChatSessionLinkId('shopify-y-join-8f3c1a0b')).toBe(false);
    expect(isValidChatSessionLinkId('epir-first-party')).toBe(false);
    expect(isValidChatSessionLinkId('')).toBe(false);
    expect(isValidChatSessionLinkId(null)).toBe(false);
  });
});
