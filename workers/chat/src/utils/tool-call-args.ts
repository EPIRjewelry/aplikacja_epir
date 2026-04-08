export type ToolResult = { result?: unknown; error?: unknown };

type ToolArgsParseSuccess = { ok: true; args: Record<string, unknown> };
type ToolArgsParseFailure = {
  ok: false;
  error: {
    code: number;
    message: string;
    details: {
      parse_error: string;
      raw_snippet: string;
    };
  };
};

export type ToolArgsParseOutcome = ToolArgsParseSuccess | ToolArgsParseFailure;

export function parseToolCallArguments(rawArguments: string | null | undefined, toolName: string): ToolArgsParseOutcome {
  if (typeof rawArguments !== 'string' || rawArguments.trim().length === 0) {
    return { ok: true, args: {} };
  }

  try {
    const parsed = JSON.parse(rawArguments);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: {
          code: -32602,
          message: `Invalid tool arguments JSON for "${toolName}"`,
          details: {
            parse_error: 'Tool arguments must be a JSON object',
            raw_snippet: rawArguments.slice(0, 400),
          },
        },
      };
    }
    return { ok: true, args: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: -32602,
        message: `Invalid tool arguments JSON for "${toolName}"`,
        details: {
          parse_error: error instanceof Error ? error.message : String(error),
          raw_snippet: rawArguments.slice(0, 400),
        },
      },
    };
  }
}

export async function executeToolWithParsedArguments(
  toolName: string,
  rawArguments: string | null | undefined,
  executor: (args: Record<string, unknown>) => Promise<ToolResult>,
): Promise<{ toolResult: ToolResult; parsedArgs?: Record<string, unknown>; skippedExecution: boolean }> {
  const parsed = parseToolCallArguments(rawArguments, toolName);
  if (!parsed.ok) {
    return {
      toolResult: { error: parsed.error },
      skippedExecution: true,
    };
  }

  const toolResult = await executor(parsed.args);
  return {
    toolResult,
    parsedArgs: parsed.args,
    skippedExecution: false,
  };
}
