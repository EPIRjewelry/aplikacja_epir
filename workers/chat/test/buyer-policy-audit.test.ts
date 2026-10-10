import { describe, expect, it, vi } from 'vitest';

import { recordPolicyTouchIfIdentified } from '../src/buyer/policy-audit';
import * as repo from '../src/memory/repo';

describe('policy audit (guest skip)', () => {
  it('does not write memory_events without shopify_customer_id', async () => {
    const spy = vi.spyOn(repo, 'insertMemoryEvent').mockResolvedValue(true);
    await recordPolicyTouchIfIdentified(
      { DB_CHATBOT: {} as D1Database } as import('../src/config/bindings').Env,
      { shopifyCustomerId: null, sources: ['policy-1'], contentHash: 'h1' },
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
