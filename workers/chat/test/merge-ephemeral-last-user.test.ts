import { describe, expect, it } from 'vitest';
import {
  mergeEphemeralBlockIntoLastUser,
  EPHEMERAL_USER_CONTEXT_HEADER,
} from '../src/utils/merge-ephemeral-last-user';
import type { GroqMessage } from '../src/ai-client';

describe('mergeEphemeralBlockIntoLastUser', () => {
  it('prepends block to string content of last user', () => {
    const m: GroqMessage[] = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'Hej' },
    ];
    const out = mergeEphemeralBlockIntoLastUser(m, 'cart: x');
    expect(out[0].content).toBe('s');
    expect(out[1].content).toContain(EPHEMERAL_USER_CONTEXT_HEADER);
    expect(out[1].content).toContain('cart: x');
    expect(out[1].content).toContain('Hej');
  });

  it('returns shallow copy and no-op for empty block', () => {
    const m: GroqMessage[] = [{ role: 'user', content: 'x' }];
    const out = mergeEphemeralBlockIntoLastUser(m, '   ');
    expect(out[0].content).toBe('x');
    expect(out[0]).not.toBe(m[0]);
  });

  it('merges with first text part when content is array', () => {
    const m: GroqMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Pytanie' },
          { type: 'image_url', image_url: { url: 'https://x' } },
        ],
      },
    ];
    const out = mergeEphemeralBlockIntoLastUser(m, 'ctx=1');
    const arr = out[0].content as { type: string; text?: string }[];
    expect(arr[0].type).toBe('text');
    expect(arr[0].text).toContain('ctx=1');
    expect(arr[0].text).toContain('Pytanie');
    expect(arr[1].type).toBe('image_url');
  });
});
