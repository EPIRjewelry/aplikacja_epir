import { describe, expect, it } from 'vitest';
import {
  buildOpenRouterChatBody,
  isOpenRouterParameterRoutingError,
} from '../src/openrouter-params';

describe('openrouter-params', () => {
  it('detects OpenRouter filter-by-parameters 404', () => {
    const body =
      '{"error":{"message":"No endpoints found that can handle the requested parameters.","code":404,"metadata":{"routing_funnel":[{"step":"Filter by Parameters"}]}}}';
    expect(isOpenRouterParameterRoutingError(404, body)).toBe(true);
    expect(isOpenRouterParameterRoutingError(200, body)).toBe(false);
    expect(isOpenRouterParameterRoutingError(404, 'unrelated')).toBe(false);
  });

  it('omits parallel_tool_calls and drops tools when includeTools is false', () => {
    const withTools = buildOpenRouterChatBody({
      model: 'deepseek/deepseek-chat',
      messages: [],
      stream: true,
      maxTokens: 2048,
      temperature: 0.5,
      topP: 0.9,
      tools: [{ type: 'function' }],
      toolChoice: 'auto',
      includeTools: true,
    });
    expect(withTools.tools).toBeDefined();
    expect(withTools.tool_choice).toBe('auto');
    expect(withTools.parallel_tool_calls).toBeUndefined();

    const without = buildOpenRouterChatBody({
      model: 'deepseek/deepseek-chat',
      messages: [],
      stream: true,
      maxTokens: 2048,
      temperature: 0.5,
      topP: 0.9,
      tools: [{ type: 'function' }],
      toolChoice: 'auto',
      includeTools: false,
    });
    expect(without.tools).toBeUndefined();
    expect(without.tool_choice).toBeUndefined();
  });

  it('skips tools when modalities are set (image gen)', () => {
    const body = buildOpenRouterChatBody({
      model: 'recraft/recraft-v4.1',
      messages: [],
      stream: true,
      maxTokens: 2048,
      temperature: 0.5,
      topP: 0.9,
      modalities: ['image'],
      tools: [{ type: 'function' }],
      toolChoice: 'auto',
      includeTools: true,
    });
    expect(body.modalities).toEqual(['image']);
    expect(body.tools).toBeUndefined();
  });
});
