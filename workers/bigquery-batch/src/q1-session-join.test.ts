import { describe, expect, it } from 'vitest';
import { q1SessionsWithChatAndPurchase } from './q1-session-join';

describe('q1SessionsWithChatAndPurchase', () => {
  it('joins chat and purchase on same session_id', () => {
    const sid = 'sess-unified-1';
    const matched = q1SessionsWithChatAndPurchase(
      [
        { session_id: sid, event_type: 'page_viewed' },
        { session_id: sid, event_type: 'purchase_completed' },
        { session_id: sid, event_type: 'order_attributed' },
      ],
      [{ session_id: sid, role: 'user' }],
    );
    expect(matched).toEqual([sid]);
  });

  it('counts one purchase per session when both purchase_completed and order_attributed', () => {
    const sid = 'sess-dual-purchase';
    const matched = q1SessionsWithChatAndPurchase(
      [
        { session_id: sid, event_type: 'purchase_completed' },
        { session_id: sid, event_type: 'order_attributed' },
      ],
      [{ session_id: sid, role: 'user' }],
    );
    expect(matched).toHaveLength(1);
  });

  it('does not join when order session differs', () => {
    const matched = q1SessionsWithChatAndPurchase(
      [{ session_id: 'other', event_type: 'order_attributed' }],
      [{ session_id: 'chat-only', role: 'user' }],
    );
    expect(matched).toEqual([]);
  });
});
