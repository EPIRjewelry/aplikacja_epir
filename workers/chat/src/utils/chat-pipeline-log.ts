export function chatPipelineLog(payload: Record<string, unknown>): void {
  try {
    console.log('[chat-pipeline]', JSON.stringify(payload));
  } catch {
    console.log('[chat-pipeline]', payload);
  }
}
