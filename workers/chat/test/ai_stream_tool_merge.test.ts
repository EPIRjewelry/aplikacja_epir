import { describe, it, expect } from 'vitest';
import { __test } from '../src/ai-client';

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
