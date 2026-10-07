import {expect} from 'vitest';
import {BUYER_UNAVAILABLE_JSON} from '../../src/buyer/handle-buyer-turn';

export function expectBuyerUnavailableJson(payload: Record<string, unknown>): void {
  expect(payload.type).toBe(BUYER_UNAVAILABLE_JSON.type);
  expect(payload.reason).toBe(BUYER_UNAVAILABLE_JSON.reason);
  expect(payload.reply).toBe(BUYER_UNAVAILABLE_JSON.reply);
}
