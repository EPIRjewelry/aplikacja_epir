/**
 * workers/worker/src/utils/history.ts
 * 
 * History management utilities: truncation, sliding window, token estimation
 * Reduces prompt size and prevents context overflow
 */

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

function splitLeadingSystemMessages(messages: Message[]): {
  leadingSystemMessages: Message[];
  restMessages: Message[];
} {
  const firstNonSystemIndex = messages.findIndex((message) => message.role !== 'system');
  if (firstNonSystemIndex === -1) {
    return {
      leadingSystemMessages: messages,
      restMessages: [],
    };
  }

  return {
    leadingSystemMessages: messages.slice(0, firstNonSystemIndex),
    restMessages: messages.slice(firstNonSystemIndex),
  };
}

/**
 * Estimate token count for a message (rough approximation)
 * Rule of thumb: ~4 characters per token for English, ~3 for Polish
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Conservative estimate: 3.5 chars per token for Polish text
  return Math.ceil(text.length / 3.5);
}

/**
 * Calculate total tokens for message array
 */
export function calculateMessageTokens(messages: Message[]): number {
  let total = 0;
  
  for (const msg of messages) {
    // Role + content
    total += 4; // Role token overhead
    total += estimateTokens(msg.content || '');
    
    // Tool calls (if present)
    if (msg.tool_calls) {
      total += estimateTokens(JSON.stringify(msg.tool_calls));
    }
    
    // Tool name/id
    if (msg.tool_call_id) total += 10;
    if (msg.name) total += estimateTokens(msg.name);
  }
  
  return total;
}

/**
 * Truncate history to fit within token limit using sliding window
 * 
 * Strategy:
 * 1. Always keep system message (index 0)
 * 2. Always keep last N user/assistant exchanges
 * 3. Summarize or drop older messages if needed
 * 4. Keep tool calls/responses together (don't split pairs)
 * 
 * @param messages - Full message history
 * @param maxTokens - Maximum tokens allowed (default: 8000)
 * @param keepRecentCount - Minimum recent messages to keep (default: 10)
 * @returns Truncated message array
 */
export function truncateHistory(
  messages: Message[],
  maxTokens: number = 8000,
  keepRecentCount: number = 10
): Message[] {
  if (messages.length === 0) return [];
  
  // Calculate current token count
  const currentTokens = calculateMessageTokens(messages);
  
  // If within limit, return as-is
  if (currentTokens <= maxTokens) {
    return messages;
  }
  
  console.log(`[truncateHistory] Current tokens: ${currentTokens}, target: ${maxTokens}`);
  
  // Always keep all leading system messages (base prompt + runtime context)
  const { leadingSystemMessages, restMessages } = splitLeadingSystemMessages(messages);
  
  // Keep recent messages (sliding window from end)
  const recentMessages = restMessages.slice(-keepRecentCount);
  
  // Calculate tokens with system + recent
  let result = [...leadingSystemMessages, ...recentMessages];
  let resultTokens = calculateMessageTokens(result);
  
  // If still over limit, reduce recent count
  if (resultTokens > maxTokens && recentMessages.length > 2) {
    const reducedRecent = recentMessages.slice(-Math.max(2, Math.floor(keepRecentCount / 2)));
    result = [...leadingSystemMessages, ...reducedRecent];
    resultTokens = calculateMessageTokens(result);
  }
  
  console.log(`[truncateHistory] Truncated from ${messages.length} to ${result.length} messages, estimated tokens: ${resultTokens}`);
  
  return result;
}

/**
 * Create a summary message for dropped history
 * Useful for maintaining context when truncating
 */
export function createSummaryMessage(droppedMessages: Message[]): Message {
  const userMsgs = droppedMessages.filter(m => m.role === 'user').length;
  const assistantMsgs = droppedMessages.filter(m => m.role === 'assistant').length;
  
  return {
    role: 'system',
    content: `[Context: Wcześniejsza rozmowa zawierała ${userMsgs} pytań klienta i ${assistantMsgs} odpowiedzi asystenta. Staraj się zachować ciągłość kontekstu.]`
  };
}

/**
 * Sliding window with summary: Keeps recent messages + summary of old ones
 */
export function truncateWithSummary(
  messages: Message[],
  maxTokens: number = 8000,
  keepRecentCount: number = 10
): Message[] {
  if (messages.length === 0) return [];
  
  const currentTokens = calculateMessageTokens(messages);
  
  if (currentTokens <= maxTokens) {
    return messages;
  }
  
  // Preserve all leading system messages (prompt + injected runtime context)
  const { leadingSystemMessages, restMessages } = splitLeadingSystemMessages(messages);
  const recentMessages = restMessages.slice(-keepRecentCount);
  const oldMessages = restMessages.slice(0, -keepRecentCount);
  
  // Create summary of old messages
  const summaryMsg = oldMessages.length > 0 ? createSummaryMessage(oldMessages) : null;
  
  // Build result with summary
  const result = [
    ...leadingSystemMessages,
    ...(summaryMsg ? [summaryMsg] : []),
    ...recentMessages
  ];
  
  const resultTokens = calculateMessageTokens(result);
  
  console.log(`[truncateWithSummary] ${messages.length} → ${result.length} messages, tokens: ${currentTokens} → ${resultTokens}`);
  
  return result;
}
