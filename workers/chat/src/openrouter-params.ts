/**
 * OpenRouter odrzuca request 404 „No endpoints found that can handle the requested parameters”,
 * gdy żaden provider nie obsługuje tooli / parallel_tool_calls / modalities.
 */

export function isOpenRouterParameterRoutingError(status: number, body: string): boolean {
  if (status !== 400 && status !== 404) return false;
  const t = body.toLowerCase();
  return (
    t.includes('no endpoints found that can handle the requested parameters') ||
    t.includes('no endpoints found') ||
    t.includes('filter by parameters')
  );
}

/** `parallel_tool_calls` to parametr OpenAI — na OR odcina większość endpointów (m.in. DeepSeek). */
export function buildOpenRouterChatBody(input: {
  model: string;
  messages: unknown;
  stream: boolean;
  maxTokens: number;
  temperature: number;
  topP: number;
  modalities?: string[];
  tools?: unknown;
  toolChoice?: unknown;
  includeTools: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    stream: input.stream,
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    top_p: input.topP,
  };
  if (input.modalities?.length) {
    body.modalities = input.modalities;
    return body;
  }
  if (input.includeTools && input.tools) {
    body.tools = input.tools;
    if (input.toolChoice !== undefined) body.tool_choice = input.toolChoice;
  }
  return body;
}
