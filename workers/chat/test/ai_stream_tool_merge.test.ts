import { describe, it, expect } from 'vitest';
import { __test } from '../src/ai-client';

describe('createGroqStreamTransform usage propagation', () => {
  it('emits cached_tokens alongside prompt/completion tokens when available', async () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10800,"completion_tokens":42,"prompt_tokens_details":{"cached_tokens":5000}}}',
      'data: [DONE]',
    ];
    const encoder = new TextEncoder();
    const input = new ReadableStream<Uint8Array>({
      start(c) {
        for (const line of lines) c.enqueue(encoder.encode(line + '\n'));
        c.close();
      },
    });

    const reader = input
      .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
      .pipeThrough(__test.createGroqStreamTransform())
      .getReader();

    let usageEvt: { prompt_tokens: number; completion_tokens: number; cached_tokens?: number } | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.type === 'usage') {
        usageEvt = {
          prompt_tokens: value.prompt_tokens,
          completion_tokens: value.completion_tokens,
          cached_tokens: value.cached_tokens,
        };
      }
    }

    expect(usageEvt).not.toBeNull();
    expect(usageEvt!.prompt_tokens).toBe(10800);
    expect(usageEvt!.completion_tokens).toBe(42);
    expect(usageEvt!.cached_tokens).toBe(5000);
  });
});

describe('createGroqStreamTransform tool_call merging', () => {
  it('merges streamed deltas with index=0 and no id into one tool_call (no call_2..call_N spam)', async () => {
    const lines = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"search_catalog","arguments":""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"catalog\\":{\\"query\\""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" : \\"x\\"}}"}}],"finish_reason":"tool_calls"}}]}',
    ];

    const encoder = new TextEncoder();
    const input = new ReadableStream<Uint8Array>({
      start(c) {
        for (const line of lines) {
          c.enqueue(encoder.encode(line + '\n'));
        }
        c.close();
      },
    });

    const reader = input
      .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
      .pipeThrough(__test.createGroqStreamTransform())
      .getReader();

    const toolCalls: { name: string; arguments: string }[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.type === 'tool_call') {
        toolCalls.push({ name: value.call.name, arguments: value.call.arguments });
      }
    }

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('search_catalog');
    expect(toolCalls[0].arguments).toContain('query');
  });
});
