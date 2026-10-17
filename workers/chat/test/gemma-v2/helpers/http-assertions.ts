import {expect} from 'vitest';
import {
  BUYER_CLIENT_ERROR_MESSAGE,
  BUYER_UNAVAILABLE_JSON,
} from '../../../src/buyer/handle-buyer-turn';

export function expectBuyerMessageShape(
  json: Record<string, unknown>,
  expected: {mode?: string; channelId?: string},
) {
  expect(json.type).toBe('message');
  expect(typeof json.reply).toBe('string');
  expect((json.reply as string).length).toBeGreaterThan(0);
  expect(typeof json.session_id).toBe('string');
  if (expected.mode) expect(json.mode).toBe(expected.mode);
  if (expected.channelId) expect(json.channel_id).toBe(expected.channelId);
}

export function expectBuyerUnavailable(json: Record<string, unknown>) {
  expect(json).toEqual(BUYER_UNAVAILABLE_JSON);
}

export function expectMissingUserMessage(json: Record<string, unknown>, status: number) {
  expect(status).toBe(400);
  expect(json.type).toBe('error');
  expect(json.reason).toBe('missing_user_message');
  expect(json.error).toBe(BUYER_CLIENT_ERROR_MESSAGE);
}

export function expectAssistantFailed(json: Record<string, unknown>, status: number) {
  expect(status).toBe(500);
  expect(json.type).toBe('error');
  expect(json.reason).toBe('assistant_failed');
  expect(json.error).toBe(BUYER_CLIENT_ERROR_MESSAGE);
}
