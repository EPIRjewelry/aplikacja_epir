import { describe, it, expect } from 'vitest';
import { buildMessagesForToolFailureRecovery } from '../src/utils/buildRecoveryMessages';
import type { GroqMessage } from '../src/ai-client';

describe('buildMessagesForToolFailureRecovery', () => {
  it('drops raw tool messages but injects summarized tool block before recovery system', () => {
    const messages: GroqMessage[] = [
      { role: 'system', content: 'base' },
      { role: 'user', content: 'Dodaj do koszyka' },
      { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'update_cart', arguments: '{}' } }] },
      { role: 'tool', name: 'update_cart', tool_call_id: '1', content: '{"ok":true}' },
      { role: 'assistant', content: 'Gotowe.' },
    ];
    const out = buildMessagesForToolFailureRecovery(messages);
    expect(out.some((m) => m.role === 'tool')).toBe(false);
    expect(out.filter((m) => m.role === 'assistant').length).toBe(1);
    const summary = out.find((m) => m.role === 'user' && String(m.content).includes('Podsumowanie wyników narzędzi'));
    expect(summary).toBeDefined();
    expect(String(summary?.content)).toContain('update_cart');
    expect(out[out.length - 1].role).toBe('system');
    expect(String(out[out.length - 1].content)).toContain('odzyskiwania');
  });
});
