import { describe, expect, it, vi } from 'vitest';
import { executeToolWithParsedArguments } from '../src/utils/tool-call-args';

describe('executeToolWithParsedArguments', () => {
  it('does not execute tool callback when JSON args are invalid', async () => {
    const executor = vi.fn().mockResolvedValue({ result: { ok: true } });

    const outcome = await executeToolWithParsedArguments(
      'search_shop_catalog',
      '{"query": "pierścionek"',
      executor,
    );

    expect(outcome.skippedExecution).toBe(true);
    expect(executor).not.toHaveBeenCalled();
    expect((outcome.toolResult as any).error?.code).toBe(-32602);
    expect(String((outcome.toolResult as any).error?.message)).toContain('Invalid tool arguments JSON');
  });

  it('executes tool callback when JSON args are valid', async () => {
    const executor = vi.fn().mockResolvedValue({ result: { ok: true } });

    const outcome = await executeToolWithParsedArguments(
      'search_shop_catalog',
      '{"query":"czarny onyks"}',
      executor,
    );

    expect(outcome.skippedExecution).toBe(false);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith({ query: 'czarny onyks' });
    expect((outcome.toolResult as any).result).toEqual({ ok: true });
  });
});
