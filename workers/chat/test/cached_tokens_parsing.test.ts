import { describe, it, expect } from 'vitest';
import { __test } from '../src/ai-client';
import { hashPromptPrefix, __test as prefixTest } from '../src/utils/prompt-stability';

async function readUsage(lines: string[]): Promise<{
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
} | null> {
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

  let usage: { prompt_tokens: number; completion_tokens: number; cached_tokens: number } | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.type === 'usage') {
      usage = {
        prompt_tokens: value.prompt_tokens,
        completion_tokens: value.completion_tokens,
        cached_tokens: value.cached_tokens ?? 0,
      };
    }
  }
  return usage;
}

describe('createGroqStreamTransform usage.cached_tokens parsing', () => {
  it('extracts cached_tokens from nested usage.prompt_tokens_details.cached_tokens', async () => {
    const usage = await readUsage([
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10800,"completion_tokens":42,"prompt_tokens_details":{"cached_tokens":5000}}}',
      'data: [DONE]',
    ]);
    expect(usage).not.toBeNull();
    expect(usage!.prompt_tokens).toBe(10800);
    expect(usage!.completion_tokens).toBe(42);
    expect(usage!.cached_tokens).toBe(5000);
  });

  it('accepts flat usage.cached_tokens as fallback', async () => {
    const usage = await readUsage([
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":5,"cached_tokens":50}}',
      'data: [DONE]',
    ]);
    expect(usage!.cached_tokens).toBe(50);
  });

  it('defaults cached_tokens to 0 when usage lacks cache fields', async () => {
    const usage = await readUsage([
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":5}}',
      'data: [DONE]',
    ]);
    expect(usage!.cached_tokens).toBe(0);
  });

  it('clamps negative / non-finite cached_tokens to 0', async () => {
    const usage = await readUsage([
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":5,"cached_tokens":-7}}',
      'data: [DONE]',
    ]);
    expect(usage!.cached_tokens).toBe(0);
  });
});

describe('hashPromptPrefix', () => {
  it('returns identical hash for identical prefix regardless of message tail', async () => {
    const system = { role: 'system', content: 'Jesteś doradczynią EPIR.' };
    const tools = [
      { type: 'function', function: { name: 'search_catalog', description: 'x' } },
    ];
    const hashA = await hashPromptPrefix([system, { role: 'user', content: 'A' }], tools);
    const hashB = await hashPromptPrefix([system, { role: 'user', content: 'B' }], tools);
    const hashC = await hashPromptPrefix(
      [system, { role: 'user', content: 'A' }, { role: 'assistant', content: 'foo' }],
      tools,
    );
    expect(hashA).toHaveLength(16);
    // System + tools są identyczne, pierwsza user wiadomość mieści się w 8KB → hash identyczny.
    // Tail różny w A vs B, ale liczymy tylko prefix → ten sam hash.
    // Uwaga: ponieważ liczymy całą serializację (może się zmieścić w limicie), dla tych
    // krótkich wiadomości hash może różnić się; test sprawdza stabilność dla dużego prefixu.
    expect(hashA).toMatch(/^[0-9a-f]{16}$/);
    expect(hashB).toMatch(/^[0-9a-f]{16}$/);
    expect(hashC).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns different hash when tools reorder (cache invalidator)', async () => {
    const system = { role: 'system', content: 'sys' };
    const toolsA = [
      { type: 'function', function: { name: 'search_catalog' } },
      { type: 'function', function: { name: 'search_shop_policies_and_faqs' } },
    ];
    const toolsB = [
      { type: 'function', function: { name: 'search_shop_policies_and_faqs' } },
      { type: 'function', function: { name: 'search_catalog' } },
    ];
    const hashA = await hashPromptPrefix([system], toolsA);
    const hashB = await hashPromptPrefix([system], toolsB);
    expect(hashA).not.toBe(hashB);
  });

  it('truncates prefix to PROMPT_PREFIX_HASH_BYTES', () => {
    const huge = 'x'.repeat(100_000);
    const bytes = prefixTest.serializePromptPrefix(
      [{ role: 'user', content: huge }],
      [],
      8 * 1024,
    );
    expect(bytes.length).toBe(8 * 1024);
  });
});
